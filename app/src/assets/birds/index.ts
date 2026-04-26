import cactusWren from "./cactus-wren.png";
import vermilionFlycatcher from "./vermilion-flycatcher.png";
import gambelsQuail from "./gambels-quail.png";
import greaterRoadrunner from "./greater-roadrunner.png";
import greatHornedOwl from "./great-horned-owl.png";

// Map common name -> headshot. Lowercased + trimmed for forgiving lookup.
const BIRD_AVATARS: Record<string, string> = {
  "cactus wren": cactusWren,
  "vermilion flycatcher": vermilionFlycatcher,
  "gambel's quail": gambelsQuail,
  "gambels quail": gambelsQuail,
  "greater roadrunner": greaterRoadrunner,
  "great horned owl": greatHornedOwl,
};

export function getBirdAvatar(name?: string | null): string | undefined {
  if (!name) return undefined;
  return BIRD_AVATARS[name.trim().toLowerCase()];
}

export {
  cactusWren,
  vermilionFlycatcher,
  gambelsQuail,
  greaterRoadrunner,
  greatHornedOwl,
};
