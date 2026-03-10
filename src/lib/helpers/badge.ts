import { badgeToneClassMap, type BadgeTone } from "@/lib/constants/badge-variants";

export function getBadgeToneClass(tone: BadgeTone): string {
  return badgeToneClassMap[tone];
}
