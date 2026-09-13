import { publicUrl } from "@/lib/public-url";

export type SpriteBook = {
  queenWalk: HTMLImageElement;
  queenAttack: HTMLImageElement;
  scorpionWalk: HTMLImageElement;
  scorpionAttack: HTMLImageElement;
  humanWalk: HTMLImageElement;
  humanAttack: HTMLImageElement;
  spiderlingWalk: HTMLImageElement;
  packAttack: HTMLImageElement;
  siegeWalk: HTMLImageElement;
  siegeAttack: HTMLImageElement;
  venom: HTMLImageElement;
  siegeShot: HTMLImageElement;
  impact: HTMLImageElement;
  web: HTMLImageElement;
  nest: HTMLImageElement;
  cocoon: HTMLImageElement;
  eggs: HTMLImageElement;
  tree: HTMLImageElement;
  burrow: HTMLImageElement;
  floor: HTMLImageElement;
  beeWalk: HTMLImageElement;
  waspWalk: HTMLImageElement;
  stagWalk: HTMLImageElement;
  tower: HTMLImageElement;
  nestInside: HTMLImageElement;
};

const SRC: Record<keyof SpriteBook, string> = {
  queenWalk: publicUrl("sprites/queen-walk.png"),
  queenAttack: publicUrl("sprites/queen-attack.png"),
  scorpionWalk: publicUrl("sprites/scorpion-walk.png"),
  scorpionAttack: publicUrl("sprites/scorpion-attack.png"),
  humanWalk: publicUrl("sprites/human-walk.png"),
  humanAttack: publicUrl("sprites/human-attack.png"),
  spiderlingWalk: publicUrl("sprites/spiderling-walk.png"),
  packAttack: publicUrl("sprites/pack-attack.png"),
  siegeWalk: publicUrl("sprites/siege-walk.png"),
  siegeAttack: publicUrl("sprites/siege-attack.png"),
  venom: publicUrl("sprites/venom.png"),
  siegeShot: publicUrl("sprites/siege-shot.png"),
  impact: publicUrl("sprites/impact.png"),
  web: publicUrl("sprites/web.png"),
  nest: publicUrl("sprites/nest.png"),
  cocoon: publicUrl("sprites/cocoon.png"),
  eggs: publicUrl("sprites/eggs.png"),
  tree: publicUrl("sprites/tree.png"),
  burrow: publicUrl("sprites/burrow.png"),
  floor: publicUrl("map/hollow-floor.jpg"),
  beeWalk: publicUrl("sprites/bee-walk.png"),
  waspWalk: publicUrl("sprites/wasp-walk.png"),
  stagWalk: publicUrl("sprites/stag-walk.png"),
  tower: publicUrl("sprites/tower.png"),
  nestInside: publicUrl("map/nest-interior.jpg"),
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

export async function loadAssets(): Promise<SpriteBook> {
  const entries = await Promise.all(
    (Object.keys(SRC) as (keyof SpriteBook)[]).map(async (key) => {
      const img = await loadImage(SRC[key]);
      return [key, img] as const;
    }),
  );
  return Object.fromEntries(entries) as SpriteBook;
}
