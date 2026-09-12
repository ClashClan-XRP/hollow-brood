export type SpriteBook = {
  queenWalk: HTMLImageElement;
  queenAttack: HTMLImageElement;
  scorpionWalk: HTMLImageElement;
  scorpionAttack: HTMLImageElement;
  humanWalk: HTMLImageElement;
  humanAttack: HTMLImageElement;
  spiderlingWalk: HTMLImageElement;
  venom: HTMLImageElement;
  impact: HTMLImageElement;
  web: HTMLImageElement;
  nest: HTMLImageElement;
  cocoon: HTMLImageElement;
  eggs: HTMLImageElement;
  tree: HTMLImageElement;
  burrow: HTMLImageElement;
  floor: HTMLImageElement;
};

const SRC: Record<keyof SpriteBook, string> = {
  queenWalk: "/sprites/queen-walk.png",
  queenAttack: "/sprites/queen-attack.png",
  scorpionWalk: "/sprites/scorpion-walk.png",
  scorpionAttack: "/sprites/scorpion-attack.png",
  humanWalk: "/sprites/human-walk.png",
  humanAttack: "/sprites/human-attack.png",
  spiderlingWalk: "/sprites/spiderling-walk.png",
  venom: "/sprites/venom.png",
  impact: "/sprites/impact.png",
  web: "/sprites/web.png",
  nest: "/sprites/nest.png",
  cocoon: "/sprites/cocoon.png",
  eggs: "/sprites/eggs.png",
  tree: "/sprites/tree.png",
  burrow: "/sprites/burrow.png",
  floor: "/map/hollow-floor.jpg",
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
