import {
  AirVent,
  Bath,
  BedDouble,
  BriefcaseBusiness,
  Car,
  CarFront,
  CircleParking,
  Coffee,
  Dumbbell,
  KeyRound,
  Luggage,
  PawPrint,
  ShowerHead,
  Snowflake,
  Trees,
  Tv,
  Utensils,
  UtensilsCrossed,
  WashingMachine,
  Waves,
  Wifi,
  WifiOff,
  Wind,
} from "lucide-svelte";

const amenityIcons = {
  AirVent,
  Bath,
  BedDouble,
  BriefcaseBusiness,
  Car,
  CarFront,
  CircleParking,
  Coffee,
  Dumbbell,
  KeyRound,
  Luggage,
  PawPrint,
  ShowerHead,
  Snowflake,
  Trees,
  Tv,
  Utensils,
  UtensilsCrossed,
  WashingMachine,
  Waves,
  Wifi,
  WifiOff,
  Wind,
};

export const amenityIconNames = Object.keys(amenityIcons);

function iconSlug(name: string) {
  return name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

const iconEntriesBySlug = new Map(
  Object.entries(amenityIcons).map(([name, component]) => [
    iconSlug(name),
    { name, component },
  ]),
);

export function normalizeLucideIconName(name: string) {
  return iconEntriesBySlug.get(iconSlug(name))?.name ?? null;
}

export function getLucideIcon(name: string | null) {
  return name
    ? (iconEntriesBySlug.get(iconSlug(name))?.component ?? null)
    : null;
}
