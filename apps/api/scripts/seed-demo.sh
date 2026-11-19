#!/usr/bin/env bash
# scripts/seed-demo.sh — put some data into a running NeoAMS, so the
# interface has something to show.
#
#   scripts/seed-demo.sh [base-url] [email] [password]
#
# It signs in as the administrator and creates a room type, some rooms, a
# guest, a booking, an expense and a payment. It may be run more than
# once: whatever is already there is left alone.
set -euo pipefail

BASE="${1:-http://localhost:3000}"
EMAIL="${2:-ada@neoams.test}"
PASSWORD="${3:-AdaAdmin1234!}"
JAR="$(mktemp)"
trap 'rm -f "$JAR" /tmp/seed-body.json' EXIT
ORIGIN="${ORIGIN:-http://localhost:5173}"

say() { printf '  %s\n' "$*"; }

post() {
  local path="$1" body="$2" expected="${3:-201}"
  local status
  status="$(curl -s -o /tmp/seed-body.json -w '%{http_code}' -X POST "$BASE$path" \
    -H 'content-type: application/json' \
    -H "origin: $ORIGIN" \
    -c "$JAR" -b "$JAR" -d "$body")"
  if [ "$status" != "$expected" ]; then
    echo "FAILED: POST $path -> $status (expected $expected)" >&2
    cat /tmp/seed-body.json >&2
    exit 1
  fi
  cat /tmp/seed-body.json
}

get() {
  curl -s -H "origin: $ORIGIN" -c "$JAR" -b "$JAR" "$BASE$1"
}

# pick <json> <python-expression over `rows`> <fallback>
pick() {
  python3 -c "
import json,sys
rows = json.loads(sys.argv[1]).get('data', [])
value = eval(sys.argv[2])
print(value if value is not None else sys.argv[3])
" "$1" "$2" "$3"
}

echo "--- signing in ---"
curl -s -o /dev/null -X POST "$BASE/api/auth/sign-in/email" \
  -H 'content-type: application/json' \
  -H "origin: $ORIGIN" \
  -c "$JAR" -b "$JAR" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"

PROPERTIES="$(get '/api/v1/admin/properties?limit=1&offset=0')"
PROPERTY_ID="$(pick "$PROPERTIES" "rows[0]['id']" 1)"
say "property $PROPERTY_ID"

echo "--- the inventory ---"
TYPES="$(get "/api/v1/properties/$PROPERTY_ID/room-types")"
ROOM_TYPE_ID="$(pick "$TYPES" "next((t['id'] for t in rows if t['name'] == 'Deluxe'), None)" "")"
if [ -z "$ROOM_TYPE_ID" ]; then
  ROOM_TYPE_ID="$(post "/api/v1/properties/$PROPERTY_ID/room-types" \
    '{"name":"Deluxe","description":"A double with a view","pricePerNightCents":35000,"maxOccupancy":2,"bedConfiguration":"1 King"}' \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
  say "room type Deluxe ($ROOM_TYPE_ID)"
else
  say "room type Deluxe is already there ($ROOM_TYPE_ID)"
fi

if ! pick "$TYPES" "next((t['id'] for t in rows if t['name'] == 'Family Suite'), None)" "" | grep -q .; then
  post "/api/v1/properties/$PROPERTY_ID/room-types" \
    '{"name":"Family Suite","description":"Two rooms and a sitting room","pricePerNightCents":65000,"maxOccupancy":4,"bedConfiguration":"2 Queen"}' > /dev/null
  say "room type Family Suite"
fi

ROOMS="$(get "/api/v1/properties/$PROPERTY_ID/rooms")"
for number in 101 102 103; do
  if ! pick "$ROOMS" "next((r['id'] for r in rows if r['roomNumber'] == '$number'), None)" "" | grep -q .; then
    post "/api/v1/properties/$PROPERTY_ID/rooms" \
      "{\"roomTypeId\":$ROOM_TYPE_ID,\"roomNumber\":\"$number\",\"floor\":\"1\"}" > /dev/null
    say "room $number"
  fi
done
if ! pick "$ROOMS" "next((r['id'] for r in rows if r['roomNumber'] == '201'), None)" "" | grep -q .; then
  post "/api/v1/properties/$PROPERTY_ID/rooms" \
    "{\"roomTypeId\":$ROOM_TYPE_ID,\"roomNumber\":\"201\",\"floor\":\"2\",\"status\":\"dirty\"}" > /dev/null
  say "room 201, waiting for housekeeping"
fi

echo "--- a guest and a booking ---"
GUESTS="$(get "/api/v1/properties/$PROPERTY_ID/guests?q=Amina")"
GUEST_ID="$(pick "$GUESTS" "next((g['id'] for g in rows if g['lastName'] == 'Wanjiru'), None)" "")"
if [ -z "$GUEST_ID" ]; then
  GUEST_ID="$(post "/api/v1/properties/$PROPERTY_ID/guests" \
    '{"firstName":"Amina","lastName":"Wanjiru","phone":"+254700123456","email":"amina@example.com","country":"Kenya"}' \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
  say "guest Amina Wanjiru ($GUEST_ID)"
else
  say "the guest is already there ($GUEST_ID)"
fi

ROOM_ID="$(get "/api/v1/properties/$PROPERTY_ID/rooms" > /tmp/seed-rooms.json; pick "$(cat /tmp/seed-rooms.json)" "next(r['id'] for r in rows if r['roomNumber'] == '101')" "")"

TODAY="$(date -u +%Y-%m-%d)"
TOMORROW="$(date -u -d '+1 day' +%Y-%m-%d)"

BOOKINGS="$(get "/api/v1/properties/$PROPERTY_ID/bookings")"
if ! pick "$BOOKINGS" "next((b for b in rows if b['guestName'] == 'Amina Wanjiru'), None)" "" | grep -q .; then
  BOOKING_ID="$(post "/api/v1/properties/$PROPERTY_ID/bookings" \
    "{\"roomId\":$ROOM_ID,\"guestId\":$GUEST_ID,\"stay\":{\"type\":\"nightly\",\"checkInDate\":\"$TODAY\",\"checkOutDate\":\"$TOMORROW\"},\"adults\":2,\"children\":0,\"specialRequests\":\"A late arrival\"}" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["booking"]["id"])')"
  say "booking $BOOKING_ID"
  post "/api/v1/properties/$PROPERTY_ID/bookings/$BOOKING_ID/check-in" '{}' 200 > /dev/null
  say "the guest has checked in"
else
  BOOKING_ID="$(pick "$BOOKINGS" "next(b['id'] for b in rows if b['guestName'] == 'Amina Wanjiru')" "")"
  say "the booking is already there ($BOOKING_ID)"
fi

echo "--- the money ---"
CATEGORIES="$(get "/api/v1/properties/$PROPERTY_ID/expense-categories")"
CATEGORY_ID="$(pick "$CATEGORIES" "next((c['id'] for c in rows if c['name'] == 'Utilities'), None)" "")"
if [ -z "$CATEGORY_ID" ]; then
  CATEGORY_ID="$(post "/api/v1/properties/$PROPERTY_ID/expense-categories" \
    '{"name":"Utilities","description":"Water and power"}' \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
  say "the category Utilities ($CATEGORY_ID)"
fi

EXPENSES="$(get "/api/v1/properties/$PROPERTY_ID/expenses")"
if ! pick "$EXPENSES" "next((e for e in rows if e['description'] == 'Power bill'), None)" "" | grep -q .; then
  post "/api/v1/properties/$PROPERTY_ID/expenses" \
    "{\"categoryId\":$CATEGORY_ID,\"description\":\"Power bill\",\"amountCents\":12500,\"paymentMethod\":\"bank_transfer\",\"expenseDate\":\"$TODAY\"}" > /dev/null
  say "an expense"
fi

PAYMENTS="$(get "/api/v1/properties/$PROPERTY_ID/payments")"
if ! pick "$PAYMENTS" "next((p for p in rows if p['transactionReferenceCode'] == 'MPESA-DEMO1'), None)" "" | grep -q .; then
  post "/api/v1/properties/$PROPERTY_ID/bookings/$BOOKING_ID/payments" \
    '{"type":"payment","amountCents":20000,"paymentMethod":"mpesa","transactionReferenceCode":"MPESA-DEMO1"}' > /dev/null
  say "a payment"
fi

echo
echo "the data is in place"
