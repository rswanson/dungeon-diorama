import {
  Box3,
  Color,
  DirectionalLight,
  HemisphereLight,
  PCFShadowMap,
  Scene,
  Sphere,
  Vector3,
  WebGLRenderer,
} from "three";
import {
  isSceneName,
  parseScene,
  type Scene as SceneFile,
} from "../shared/scene.js";
import { createBoardMesh } from "./board.js";
import { BoardCamera } from "./camera.js";
import { attachCameraControls } from "./controls.js";
import { showErrorPanel } from "./errors.js";
import { showTurnButtons } from "./hud.js";
import { loadSpriteVoxels } from "./images.js";
import { BoardLabel } from "./label.js";
import { attachPress } from "./select.js";
import { headOf, SpriteLayer } from "./sprites.js";
import "./style.css";

const DUNGEON = new Color("#14110f");
/** The space between the top of a sprite's head and its label, in board units. */
const LABEL_GAP = 0.15;
const MAX_PIXEL_RATIO = 2;
/** The sun is high on the -x side, so a step casts its shadow to +x. */
const SUN_DIRECTION = new Vector3(-0.55, 1, 0.3).normalize();
const SHADOW_MAP_SIZE = 2048;

/** A problem with a scene that the page shows to the person, with a heading and a list. */
class SceneError extends Error {
  constructor(
    readonly heading: string,
    readonly problems: string[] = [],
  ) {
    super(heading);
  }
}

async function loadScene(name: string): Promise<SceneFile> {
  const missing = new SceneError(`The scene "${name}" does not exist.`);
  if (!isSceneName(name)) throw missing;

  // Accept: application/json stops Vite's dev HTML fallback, so a missing file is a real 404.
  const res = await fetch(`/scenes/${name}.json`, {
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) throw missing;
  if (!res.ok) {
    throw new SceneError(`The scene "${name}" did not load.`, [
      `The server answered with status ${res.status}.`,
    ]);
  }

  const result = parseScene(await res.text());
  if (!result.ok) {
    throw new SceneError(`The scene "${name}" has problems:`, result.problems);
  }
  return result.scene;
}

function showBoard(file: SceneFile): void {
  const canvas = document.querySelector<HTMLCanvasElement>("#scene");
  if (!canvas) throw new Error("The page has no #scene canvas.");

  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));

  const scene = new Scene();
  scene.background = DUNGEON;

  const board = createBoardMesh(file.board);
  scene.add(board);

  const box = new Box3().setFromObject(board);
  const view = new BoardCamera(box);

  // The board hides a sprite behind it from a click.
  const sprites = new SpriteLayer(file.board, [board]);
  scene.add(sprites.group);
  const label = new BoardLabel();

  scene.add(new HemisphereLight("#f2e6cf", "#3b3128", 1.1));

  // The sun is twice the board's radius from its center, so the shadow camera
  // holds the whole board, whatever its size.
  const { radius } = box.getBoundingSphere(new Sphere());
  const sun = new DirectionalLight("#fff0d4", 2.6);
  sun.position.copy(view.target).addScaledVector(SUN_DIRECTION, radius * 2);
  sun.target.position.copy(view.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, {
    left: -radius,
    right: radius,
    top: radius,
    bottom: -radius,
    near: radius,
    far: radius * 3,
  });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);

  // The shadows are drawn only after a change. A change that moves a shadow
  // caster (a new sprite, or a sprite that turns) sets `needsUpdate` again.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  let size = "";
  function draw(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    // Browser zoom or a move to another display changes the ratio.
    const ratio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
    const key = `${width}x${height}@${ratio}`;
    if (key !== size) {
      size = key;
      if (ratio !== renderer.getPixelRatio()) renderer.setPixelRatio(ratio);
      renderer.setSize(width, height, false);
      view.resize(width, height);
    }
    // A turn draws again on each frame until it ends.
    // One clock: `rotate` stamps the turn with performance.now(), so does this.
    if (view.tick(performance.now())) requestDraw();
    // The sprites turn with the camera, during a turn too, so they always face it.
    if (sprites.face(view.azimuth)) renderer.shadowMap.needsUpdate = true;
    label.place(view.camera, width, height);
    renderer.render(scene, view.camera);
  }

  // The page draws only after a change. Several changes in one frame cause one draw.
  let drawQueued = false;
  function requestDraw(): void {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(() => {
      drawQueued = false;
      draw();
    });
  }

  window.addEventListener("resize", requestDraw);
  const controls = attachCameraControls(canvas, view, requestDraw);
  showTurnButtons(controls.turn);

  attachPress(canvas, controls, {
    click(at) {
      const id = sprites.spriteAt(view.ray(at.x, at.y));
      const sprite = id === null ? undefined : sprites.get(id);
      if (sprite) {
        const head = headOf(sprite, new Vector3());
        label.show(sprite.spec.name, head.setY(head.y + LABEL_GAP));
      } else {
        label.hide();
      }
      requestDraw();
    },
  });

  draw();

  // The board shows first. Each sprite stands on it when its image loads.
  for (const spec of file.sprites) {
    void loadSpriteVoxels(spec).then((voxels) => {
      sprites.add(spec, voxels);
      renderer.shadowMap.needsUpdate = true;
      requestDraw();
    });
  }
}

async function main(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  try {
    showBoard(await loadScene(params.get("scene") ?? "demo"));
  } catch (error) {
    if (error instanceof SceneError) {
      showErrorPanel(error.heading, error.problems);
    } else {
      throw error;
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  showErrorPanel("The scene did not load.", [String(error)]);
});
