#!/usr/bin/env bash
# scripts/curl-sweep.sh — exercise every endpoint against a running API.
#
#   BASE=http://localhost:3000 ./scripts/curl-sweep.sh
#
# It starts from a fresh installation (POST /setup), then walks the whole
# API: setup, auth, admin, property, staff, catalog, finance, oversight,
# uploads and the public booking flow. Each line prints the method, the path
# and the status code, so a failure is obvious at a glance.
#
# Exit code is non-zero if any check fails.

set -uo pipefail

BASE="${BASE:-http://localhost:3000}"
JAR="$(mktemp -d)/cookies.txt"
PASS=0
FAIL=0
declare -a FAILURES=()

cleanup() { rm -rf "$(dirname "$JAR")"; }
trap cleanup EXIT

# --- helpers ---------------------------------------------------------------

# Extra curl options. CURL_INSECURE=1 accepts a self-signed certificate,
# which is what the local Caddy configuration uses.
CURL_OPTS=()
[ "${CURL_INSECURE:-0}" = "1" ] && CURL_OPTS+=(-k)

# call <expected-status> <method> <path> [json-body] [label]
call() {
  local expected="$1" method="$2" path="$3" body="${4:-}" label="${5:-}"
  local args=(-s -o /tmp/curl-body.json -w '%{http_code}' -X "$method" "$BASE$path")
  [ -n "$body" ] && args+=(-H 'content-type: application/json' -d "$body")
  # Always write the jar, so the Set-Cookie from a sign-in is kept.
  # Read it only once it exists.
  args+=(-c "$JAR")
  [ -f "$JAR" ] && args+=(-b "$JAR")
  # And the browser's Origin, so the CSRF hook is exercised for real.
  args+=(-H "origin: ${ORIGIN:-http://localhost:5173}")

  local status
  status="$(curl "${CURL_OPTS[@]}" "${args[@]}")"
  if [ "$status" = "$expected" ]; then
    PASS=$((PASS + 1))
    printf '  ok   %-6s %-62s %s\n' "$method" "$path" "$status"
  else
    FAIL=$((FAIL + 1))
    FAILURES+=("$method $path -> $status (expected $expected) $(head -c 200 /tmp/curl-body.json)")
    printf '  FAIL %-6s %-62s %s (expected %s)\n' "$method" "$path" "$status" "$expected"
    printf '       %s\n' "$(head -c 300 /tmp/curl-body.json)"
  fi
  # The body stays in the file: it may be binary, and a shell variable
  # cannot hold a null byte.
}

# Extract a value from the last response body with a tiny JSON reader.
json() {
  # json <key>   -> value of a top-level string/number field
  python3 -c "
import json,sys
try:
    d=json.load(open('/tmp/curl-body.json'))
except Exception:
    print('');sys.exit()
cur=d
for part in sys.argv[1].split('.'):
    if isinstance(cur,list):
        try: cur=cur[int(part)]
        except Exception: print('');sys.exit()
    elif isinstance(cur,dict):
        cur=cur.get(part)
    else:
        print('');sys.exit()
    if cur is None: print('');sys.exit()
print(cur if not isinstance(cur,(dict,list)) else json.dumps(cur))
" "$1"
}

# Sign in, and wait if the address has hit the sign-in rate limit.
# The limit is deliberately low, so a sweep that signs in several times in
# a row has to be patient — exactly as a real browser would be.
signin() {
  local email="$1" password="$2" attempt=1 status="" wait=""
  while [ "$attempt" -le 12 ]; do
    status="$(curl "${CURL_OPTS[@]}" -s -o /tmp/curl-body.json \
      -D /tmp/curl-headers.txt -w '%{http_code}' \
      -X POST "$BASE/api/auth/sign-in/email" \
      -H 'content-type: application/json' \
      -H "origin: ${ORIGIN:-http://localhost:5173}" \
      -c "$JAR" -b "$JAR" \
      -d "{\"email\":\"$email\",\"password\":\"$password\"}")"
    if [ "$status" = "200" ]; then
      PASS=$((PASS + 1))
      printf '  ok   %-6s %-62s %s\n' POST "/api/auth/sign-in/email" "$status"
      return 0
    fi
    if [ "$status" != "429" ]; then
      FAIL=$((FAIL + 1))
      FAILURES+=("POST /api/auth/sign-in/email -> $status $(head -c 200 /tmp/curl-body.json)")
      printf '  FAIL %-6s %-62s %s (expected 200)\n' POST "/api/auth/sign-in/email" "$status"
      printf '       %s\n' "$(head -c 300 /tmp/curl-body.json)"
      return 1
    fi
    # Back off: 429 says how long to wait, in the X-Retry-After header.
    wait="$(grep -i '^x-retry-after:' /tmp/curl-headers.txt | tail -1 | tr -d '\r' | awk '{print $2}')"
    case "$wait" in
      ''|*[!0-9]*) wait=5 ;;
    esac
    [ "$wait" -gt 60 ] && wait=60
    printf '       (rate limited, waiting %ss)\n' "$wait"
    sleep "$wait"
    attempt=$((attempt + 1))
  done
  FAIL=$((FAIL + 1))
  FAILURES+=("POST /api/auth/sign-in/email -> $status after waiting")
  printf '  FAIL %-6s %-62s %s (expected 200)\n' POST "/api/auth/sign-in/email" "$status"
  return 1
}

section() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# --- 0. health -------------------------------------------------------------

section "Setup and authentication"
call 200 GET  "/api/v1/setup/status" "" "fresh install reports setup needed"

# The installer claims the system.
call 201 POST "/api/v1/setup" '{"name":"Curl Admin","email":"admin@neoams.test","password":"CurlAdmin1234!"}'
ADMIN_EMAIL="admin@neoams.test"
ADMIN_PASSWORD="CurlAdmin1234!"

call 200 GET  "/api/v1/setup/status" "" "setup now complete"

# Signing in stores the session cookie in the jar.
signin "$ADMIN_EMAIL" "$ADMIN_PASSWORD"
call 200 GET  "/api/auth/get-session" "" "session is readable"

call 403 POST "/api/v1/setup" '{"name":"Second","email":"second@neoams.test","password":"SecondPass1234!"}' "setup is locked"
call 400 POST "/api/auth/sign-up/email" '{"name":"Outsider","email":"outsider@neoams.test","password":"Outsider1234!"}' "public sign-up is closed"

section "Me"
call 200 GET  "/api/v1/me"
call 200 GET  "/api/v1/me/guest"
call 200 GET  "/api/v1/me/bookings"
call 200 PUT  "/api/v1/me/guest" '{"firstName":"Curl","lastName":"Admin","phone":"+254700000001","email":"admin@neoams.test"}'
# Changing the password closes the old session and opens a new one; the
# person stays signed in.
call 200 POST "/api/v1/me/password" '{"currentPassword":"CurlAdmin1234!","newPassword":"CurlAdmin5678!"}'
call 200 GET  "/api/v1/me" "" "the session survives a password change"
# The old password no longer opens the door.
call 401 POST "/api/auth/sign-in/email" '{"email":"'"$ADMIN_EMAIL"'","password":"CurlAdmin1234!"}'
signin "$ADMIN_EMAIL" "CurlAdmin5678!"

# --- 1. admin --------------------------------------------------------------

section "Admin: properties"
call 201 POST "/api/v1/admin/properties" '{"name":"Curl Lodge","county":"Nakuru","town":"Naivasha","phone":"+254700000002","owner":{"name":"Lodge Owner","email":"owner@neoams.test","tempPassword":"OwnerPass1234!"}}'
PROPERTY_ID="$(json id)"
PROPERTY_SLUG="$(json slug)"
OWNER_EMAIL="owner@neoams.test"

call 200 GET  "/api/v1/admin/properties"
call 200 GET  "/api/v1/admin/properties/$PROPERTY_ID"
call 200 PATCH "/api/v1/admin/properties/$PROPERTY_ID" '{"depositPercent":40,"checkInTime":"13:00","checkOutTime":"11:00"}'
call 404 GET  "/api/v1/admin/properties/999999"

section "Admin: users"
call 201 POST "/api/v1/admin/users" '{"name":"Desk Clerk","email":"clerk@neoams.test","tempPassword":"ClerkPass1234!"}'
CLERK_ID="$(json id)"
call 200 GET  "/api/v1/admin/users"
call 200 GET  "/api/v1/admin/users?q=Clerk"
call 200 GET  "/api/v1/admin/users?role=user"
call 200 GET  "/api/v1/admin/users/$CLERK_ID"
call 200 PATCH "/api/v1/admin/users/$CLERK_ID" '{"name":"Renamed Clerk"}'
call 200 POST "/api/v1/admin/users/$CLERK_ID/revoke-sessions"
call 200 POST "/api/v1/admin/users/$CLERK_ID/reset-password" '{"newPassword":"ClerkNew1234!"}'
call 200 POST "/api/v1/admin/users/$CLERK_ID/ban" '{"reason":"curl test"}'
call 200 POST "/api/v1/admin/users/$CLERK_ID/unban"
call 409 POST "/api/v1/admin/users" '{"name":"Copy","email":"clerk@neoams.test","tempPassword":"ClerkPass1234!"}'

# --- 2. sign in as the property owner ---------------------------------------

section "Sign in as the property owner"
rm -f "$JAR"
signin "owner@neoams.test" "OwnerPass1234!"
# A new owner gets a temporary password, so everything else is closed until
# it is changed. This is the guard doing its job.
call 403 GET  "/api/v1/properties/$PROPERTY_ID" "" "the owner is blocked until the password is changed"
call 200 POST "/api/v1/me/password" '{"currentPassword":"OwnerPass1234!","newPassword":"OwnerNew1234!"}'
rm -f "$JAR"
signin "owner@neoams.test" "OwnerNew1234!"
OWNER_COOKIE=1

section "Property settings and staff"
call 200 GET   "/api/v1/properties/$PROPERTY_ID"
call 200 PATCH "/api/v1/properties/$PROPERTY_ID" '{"phone":"+254700000003","email":"lodge@neoams.test"}'
call 200 GET   "/api/v1/properties/$PROPERTY_ID/staff"
call 201 POST  "/api/v1/properties/$PROPERTY_ID/staff" '{"name":"Reception","email":"reception@neoams.test","tempPassword":"RecepPass1234!","role":"receptionist"}'
STAFF_ID="$(json id)"
call 409 POST  "/api/v1/properties/$PROPERTY_ID/staff" '{"name":"Dup","email":"reception@neoams.test","tempPassword":"RecepPass1234!","role":"staff"}'
call 200 PATCH "/api/v1/properties/$PROPERTY_ID/staff/$STAFF_ID" '{"role":"manager"}'
call 200 POST  "/api/v1/properties/$PROPERTY_ID/staff/$STAFF_ID/reset-password" '{"newPassword":"RecepNew1234!"}'
call 200 DELETE "/api/v1/properties/$PROPERTY_ID/staff/$STAFF_ID"

# A newly added staff member is blocked until they change their password.
rm -f "$JAR"
signin "reception@neoams.test" "RecepNew1234!"
call 403 GET  "/api/v1/properties/$PROPERTY_ID/room-types" "" "new staff are blocked until the password is changed"
rm -f "$JAR"
signin "owner@neoams.test" "OwnerNew1234!"

section "Catalog: room types, rooms, amenities, services"
call 200 GET  "/api/v1/properties/$PROPERTY_ID/room-types"
call 201 POST "/api/v1/properties/$PROPERTY_ID/room-types" '{"name":"Deluxe Suite","pricePerNightCents":250000,"pricePerHourCents":40000,"maxOccupancy":4}'
ROOM_TYPE_ID="$(json id)"
call 200 GET  "/api/v1/properties/$PROPERTY_ID/room-types/$ROOM_TYPE_ID"
call 200 PATCH "/api/v1/properties/$PROPERTY_ID/room-types/$ROOM_TYPE_ID" '{"description":"Renovated suite"}'
call 200 GET  "/api/v1/properties/$PROPERTY_ID/rooms"
call 201 POST "/api/v1/properties/$PROPERTY_ID/rooms" '{"roomTypeId":'"$ROOM_TYPE_ID"',"roomNumber":"101","floor":"Ground"}'
ROOM_ID="$(json id)"
call 200 GET  "/api/v1/properties/$PROPERTY_ID/rooms/$ROOM_ID"
call 200 PATCH "/api/v1/properties/$PROPERTY_ID/rooms/$ROOM_ID" '{"description":"Corner room"}'
call 200 PATCH "/api/v1/properties/$PROPERTY_ID/rooms/$ROOM_ID/status" '{"status":"dirty"}'
call 200 PATCH "/api/v1/properties/$PROPERTY_ID/rooms/$ROOM_ID/status" '{"status":"available"}'
call 200 GET  "/api/v1/properties/$PROPERTY_ID/rooms?status=available"
call 200 GET  "/api/v1/properties/$PROPERTY_ID/amenities"
call 201 POST "/api/v1/properties/$PROPERTY_ID/amenities" '{"name":"Wi-Fi","icon":"wifi"}'
AMENITY_ID="$(json id)"
call 200 PUT  "/api/v1/properties/$PROPERTY_ID/amenities" "{\"amenityIds\":[$AMENITY_ID]}"
call 200 PUT  "/api/v1/properties/$PROPERTY_ID/room-types/$ROOM_TYPE_ID/amenities" "{\"amenityIds\":[$AMENITY_ID]}"
call 200 GET  "/api/v1/properties/$PROPERTY_ID/services"
call 201 POST "/api/v1/properties/$PROPERTY_ID/services" '{"name":"Breakfast","priceCents":5000}'
SERVICE_ID="$(json id)"
call 200 PATCH "/api/v1/properties/$PROPERTY_ID/services/$SERVICE_ID" '{"priceCents":6000}'

section "Guests, bookings, guests on a booking"
call 200 GET  "/api/v1/properties/$PROPERTY_ID/guests?q=Cur"
call 200 GET  "/api/v1/properties/$PROPERTY_ID/guests" "" "the guest list without a search term"
call 201 POST "/api/v1/properties/$PROPERTY_ID/guests" '{"firstName":"Ann","lastName":"Amos","phone":"+254700000010"}'
GUEST_ID="$(json id)"
call 200 GET  "/api/v1/properties/$PROPERTY_ID/guests/$GUEST_ID"
call 200 GET  "/api/v1/properties/$PROPERTY_ID/availability?type=nightly&checkInDate=2027-06-01&checkOutDate=2027-06-03"
call 201 POST "/api/v1/properties/$PROPERTY_ID/bookings" '{"roomId":'"$ROOM_ID"',"guestId":'"$GUEST_ID"',"stay":{"type":"nightly","checkInDate":"2027-06-01","checkOutDate":"2027-06-03"},"adults":2,"children":0,"specialRequests":"Late arrival"}'
BOOKING_ID="$(json booking.id)"
BOOKING_REF="$(json booking.bookingReferenceCode)"
call 200 GET  "/api/v1/properties/$PROPERTY_ID/bookings"
call 200 GET  "/api/v1/properties/$PROPERTY_ID/bookings?status=confirmed"
call 200 GET  "/api/v1/properties/$PROPERTY_ID/bookings?q=$BOOKING_REF"
call 200 GET  "/api/v1/properties/$PROPERTY_ID/bookings/$BOOKING_ID"
call 200 PATCH "/api/v1/properties/$PROPERTY_ID/bookings/$BOOKING_ID" '{"adults":3,"specialRequests":"Extra pillows"}'
# The lead guest cannot also be an additional guest.
call 409 POST "/api/v1/properties/$PROPERTY_ID/bookings/$BOOKING_ID/guests" '{"guestId":'"$GUEST_ID"'}'
call 201 POST "/api/v1/properties/$PROPERTY_ID/guests" '{"firstName":"Bob","lastName":"Bello","phone":"+254700000011"}'
EXTRA_GUEST_ID="$(json id)"
call 201 POST "/api/v1/properties/$PROPERTY_ID/bookings/$BOOKING_ID/guests" '{"guestId":'"$EXTRA_GUEST_ID"'}'
call 201 POST "/api/v1/properties/$PROPERTY_ID/bookings/$BOOKING_ID/services" '{"serviceId":'"$SERVICE_ID"',"quantity":2}'
call 200 POST "/api/v1/properties/$PROPERTY_ID/bookings/$BOOKING_ID/check-in"
call 200 POST "/api/v1/properties/$PROPERTY_ID/bookings/$BOOKING_ID/check-out"

section "Billing"
call 200 GET  "/api/v1/properties/$PROPERTY_ID/payments"
call 200 GET  "/api/v1/properties/$PROPERTY_ID/payments?status=pending"
call 200 GET  "/api/v1/properties/$PROPERTY_ID/payment-options"
call 201 POST "/api/v1/properties/$PROPERTY_ID/payment-options" '{"kind":"mpesa_paybill","label":"Pay via M-Pesa","accountNumber":"123456","accountName":"Curl Lodge","instructions":"Use your reference","sortOrder":1,"isActive":true}'
OPTION_ID="$(json id)"
call 200 PATCH "/api/v1/properties/$PROPERTY_ID/payment-options/$OPTION_ID" '{"instructions":"Use the booking reference"}'
call 201 POST "/api/v1/properties/$PROPERTY_ID/bookings/$BOOKING_ID/payments" '{"type":"payment","amountCents":100000,"paymentMethod":"mpesa","transactionReferenceCode":"MPESA-CURL1"}'

section "Finance"
call 200 GET  "/api/v1/properties/$PROPERTY_ID/expense-categories"
call 201 POST "/api/v1/properties/$PROPERTY_ID/expense-categories" '{"name":"Utilities","description":"Power and water"}'
CATEGORY_ID="$(json id)"
call 201 POST "/api/v1/properties/$PROPERTY_ID/expenses" '{"categoryId":'"$CATEGORY_ID"',"description":"January electricity","amountCents":45000,"paymentMethod":"mpesa","reference":"MPESA-EXP1","expenseDate":"2027-01-15"}'
EXPENSE_ID="$(json id)"
call 200 GET  "/api/v1/properties/$PROPERTY_ID/expenses"
call 200 GET  "/api/v1/properties/$PROPERTY_ID/expenses?from=2027-01-01&to=2027-01-31"
call 200 PATCH "/api/v1/properties/$PROPERTY_ID/expenses/$EXPENSE_ID" '{"amountCents":50000}'
call 200 GET  "/api/v1/properties/$PROPERTY_ID/reports/summary"
call 200 GET  "/api/v1/properties/$PROPERTY_ID/reports/revenue?groupBy=day"
call 200 GET  "/api/v1/properties/$PROPERTY_ID/reports/revenue?groupBy=month"

section "Today and audit trail"
call 200 GET  "/api/v1/properties/$PROPERTY_ID/today"
call 200 GET  "/api/v1/properties/$PROPERTY_ID/audit-logs"
call 200 GET  "/api/v1/properties/$PROPERTY_ID/audit-logs?entity=booking"

section "Images"
call 200 GET  "/api/v1/properties/$PROPERTY_ID/images"
call 201 POST "/api/v1/properties/$PROPERTY_ID/images" '{"imageUrl":"/uploads/test-image.png","altText":"Front of the lodge","isPrimary":true}'
PROPERTY_IMAGE_ID="$(json id)"
call 200 PATCH "/api/v1/properties/$PROPERTY_ID/images/$PROPERTY_IMAGE_ID" '{"altText":"Front elevation"}'
call 200 GET  "/api/v1/properties/$PROPERTY_ID/room-types/$ROOM_TYPE_ID/images"
call 201 POST "/api/v1/properties/$PROPERTY_ID/room-types/$ROOM_TYPE_ID/images" '{"imageUrl":"/uploads/test-suite.png","isPrimary":true}'
ROOM_IMAGE_ID="$(json id)"
call 200 PATCH "/api/v1/properties/$PROPERTY_ID/room-types/$ROOM_TYPE_ID/images/$ROOM_IMAGE_ID" '{"altText":"Suite interior"}'

# --- 3. uploads ------------------------------------------------------------

section "Uploads"
# A one-pixel PNG, written as raw bytes.
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR' > /tmp/curl-image.png
UPLOAD_STATUS="$(curl "${CURL_OPTS[@]}" -s -o /tmp/curl-body.json -w '%{http_code}' -X POST "$BASE/api/v1/uploads" \
  -b "$JAR" -H "origin: ${ORIGIN:-http://localhost:5173}" \
  -F "file=@/tmp/curl-image.png;type=image/png")"
if [ "$UPLOAD_STATUS" = "201" ]; then
  PASS=$((PASS + 1)); printf '  ok   %-6s %-62s %s\n' POST "/api/v1/uploads" "$UPLOAD_STATUS"
else
  FAIL=$((FAIL + 1)); printf '  FAIL %-6s %-62s %s\n' POST "/api/v1/uploads" "$UPLOAD_STATUS"
fi
UPLOAD_URL="$(json url)"
UPLOADED_FILE="$(json filename)"

call 200 GET "/api/v1/uploads/$UPLOADED_FILE" "" "serves the image"
call 404 GET "/api/v1/uploads/00000000-0000-0000-0000-000000000000.png"

# A PDF must be refused even when it claims to be a PNG.
printf '%%PDF-1.7\n%%%%EOF\n' > /tmp/curl-file.pdf
curl "${CURL_OPTS[@]}" -s -o /tmp/curl-body.json -w '%{http_code}' -X POST "$BASE/api/v1/uploads" \
  -b "$JAR" -H "origin: ${ORIGIN:-http://localhost:5173}" \
  -F "file=@/tmp/curl-file.pdf;type=image/png" > /tmp/curl-status.txt
if [ "$(cat /tmp/curl-status.txt)" = "400" ]; then
  PASS=$((PASS + 1)); printf '  ok   %-6s %-62s %s\n' POST "/api/v1/uploads (a PDF pretending to be a PNG)" 400
else
  FAIL=$((FAIL + 1)); printf '  FAIL %-6s %-62s %s\n' POST "/api/v1/uploads (a PDF pretending to be a PNG)" "$(cat /tmp/curl-status.txt)"
fi

call 200 DELETE "/api/v1/properties/$PROPERTY_ID/images/$PROPERTY_IMAGE_ID"
call 200 DELETE "/api/v1/properties/$PROPERTY_ID/room-types/$ROOM_TYPE_ID/images/$ROOM_IMAGE_ID"

# --- 4. the public booking flow --------------------------------------------

section "Public booking flow"
call 200 GET "/api/v1/public/properties/$PROPERTY_SLUG/availability?type=nightly&checkInDate=2027-07-01&checkOutDate=2027-07-03"
call 201 POST "/api/v1/public/properties/$PROPERTY_SLUG/bookings" '{"roomTypeId":'"$ROOM_TYPE_ID"',"stay":{"type":"nightly","checkInDate":"2027-07-01","checkOutDate":"2027-07-03"},"adults":2,"children":0,"guest":{"firstName":"Web","lastName":"Guest","phone":"+254700000020"}}'
PUBLIC_REF="$(json reference)"
PUBLIC_TOTAL="$(json totalCostCents)"
call 200 POST "/api/v1/public/bookings/lookup" "{\"reference\":\"$PUBLIC_REF\",\"phone\":\"+254700000020\"}"

# The staff confirm it from the property. An online booking starts pending.
call 200 GET  "/api/v1/properties/$PROPERTY_ID/bookings?q=$PUBLIC_REF"
PUBLIC_ID="$(json data.0.id)"
call 200 POST "/api/v1/properties/$PROPERTY_ID/bookings/$PUBLIC_ID/confirm"
# Confirming it twice is refused.
call 422 POST "/api/v1/properties/$PROPERTY_ID/bookings/$PUBLIC_ID/confirm"

call 201 POST "/api/v1/public/bookings/$PUBLIC_REF/payments" '{"phone":"+254700000020","amountCents":50000,"paymentMethod":"mpesa","transactionReferenceCode":"MPESA-PUB1"}'
call 200 POST "/api/v1/public/bookings/$PUBLIC_REF/cancel" '{"phone":"+254700000020","reason":"Changed plans"}'

# --- 5. the guards ---------------------------------------------------------

section "Guards"
# No session at all.
NOAUTH="$(curl "${CURL_OPTS[@]}" -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/properties/$PROPERTY_ID/today")"
[ "$NOAUTH" = "401" ] && { PASS=$((PASS + 1)); printf '  ok   %-6s %-62s %s\n' GET "/api/v1/properties/$PROPERTY_ID/today (no session)" "$NOAUTH"; } || { FAIL=$((FAIL + 1)); printf '  FAIL %-6s %-62s %s\n' GET "/api/v1/properties/$PROPERTY_ID/today (no session)" "$NOAUTH"; }

# A write from a foreign origin is refused.
CSRF="$(curl "${CURL_OPTS[@]}" -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/v1/properties/$PROPERTY_ID/expense-categories" \
  -b "$JAR" -H 'origin: https://evil.example' -H 'content-type: application/json' -d '{"name":"CSRF"}')"
[ "$CSRF" = "403" ] && { PASS=$((PASS + 1)); printf '  ok   %-6s %-62s %s\n' POST "a write from a foreign origin" "$CSRF"; } || { FAIL=$((FAIL + 1)); printf '  FAIL %-6s %-62s %s\n' POST "a write from a foreign origin" "$CSRF"; }

# A plain user cannot reach the admin area, but can reach their own property.
rm -f "$JAR"
signin "$ADMIN_EMAIL" "CurlAdmin5678!"
call 201 POST "/api/v1/admin/users" '{"name":"Plain User","email":"plain@neoams.test","tempPassword":"PlainPass1234!"}'
PLAIN_ID="$(json id)"
rm -f "$JAR"
signin "plain@neoams.test" "PlainPass1234!"
call 403 GET  "/api/v1/admin/users" "" "a plain user is refused the admin area"
call 403 GET  "/api/v1/properties/$PROPERTY_ID/today" "" "a plain user is refused a property they do not work at"

section "API reference"
call 200 GET "/reference/"
call 200 GET "/reference/openapi.json"

# --- summary ---------------------------------------------------------------

printf '\n\033[1mResult\033[0m: %d passed, %d failed\n' "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
  printf '\nFailures:\n'
  for f in "${FAILURES[@]}"; do printf '  - %s\n' "$f"; done
  exit 1
fi
exit 0
