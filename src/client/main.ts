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
import type { Layout } from "../shared/positions.js";
import {
  isSceneName,
  parseScene,
  type Scene as SceneFile,
} from "../shared/scene.js";
import { loadPositions, savePosition } from "./api.js";
import { createBoardMesh } from "./board.js";
import { BoardState } from "./board-state.js";
import { BoardCamera } from "./camera.js";
import { attachCameraControls } from "./controls.js";
import { showDiceSidebar } from "./dice.js";
import { SpriteDrag } from "./drag.js";
import { showErrorPanel } from "./errors.js";
import { SquareHighlight } from "./highlight.js";
import { exposeDiorama } from "./hook.js";
import { showTurnButtons } from "./hud.js";
import { loadSpriteVoxels } from "./images.js";
import { BoardLabel } from "./label.js";
import { showNotice } from "./notice.js";
import { PathLine } from "./pathline.js";
import { attachPointer } from "./pointer.js";
import { MAX_HEIGHT, SpriteLayer, VOXEL } from "./sprites.js";
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

/**
 * Shows the scene `name` from its file. `saved` gives this visitor's
 * positions, or null when they did not load.
 */
function showBoard(
  name: string,
  file: SceneFile,
  saved: Promise<Layout | null>,
): void {
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

  // The view holds the board and the tallest sprite on its highest column. The
  // box has the board's footprint, so the pan limit stays on the board.
  const box = new Box3().setFromObject(board);
  box.max.y += MAX_HEIGHT * VOXEL;
  const view = new BoardCamera(box);

  // The board hides a sprite behind it from a click.
  const sprites = new SpriteLayer(file.board, [board]);
  scene.add(sprites.group);
  const label = new BoardLabel();
  // Where each sprite stands: the scene file layout until this visitor's
  // positions load.
  const state = new BoardState(file.board, file.sprites);
  const highlight = new SquareHighlight(file.board);
  scene.add(highlight.mesh);
  const path = new PathLine(file.board);
  scene.add(path.mesh);
  // The feet of the route of a drag, near the pointer.
  const pathLabel = new BoardLabel({ className: "path-label" });

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
    const now = performance.now();
    if (view.tick(now)) requestDraw();
    // The sprites turn with the camera, during a turn too, so they always face it.
    sprites.face(view.azimuth);
    // A drop or a return draws again on each frame until it ends, as a turn does.
    if (drag.frame(now, view.azimuth)) requestDraw();
    label.place(view);
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

  const drag = new SpriteDrag({
    board: file.board,
    view,
    sprites,
    state,
    highlight,
    path,
    label: pathLabel,
    scene,
    requestDraw,
    // On a 409, another tab moved a sprite there. The result then gives the
    // positions on the server, and the drag shows them.
    async save(id, to) {
      const result = await savePosition(name, id, to);
      if (!result.ok) showNotice("Move not saved");
      return result;
    },
  });

  window.addEventListener("resize", requestDraw);
  const controls = attachCameraControls(canvas, view, requestDraw);
  showTurnButtons(controls.turn);
  showDiceSidebar(name);

  // A click shows the name of the sprite that the press grabbed.
  attachPointer(canvas, controls, drag, (grab) => {
    const sprite = grab && sprites.get(grab.id);
    if (sprite) {
      label.show(sprite.mesh, sprite.height + LABEL_GAP, sprite.spec.name);
    } else {
      label.hide();
    }
    requestDraw();
  });

  draw();

  // This visitor's positions, which the server merged with the scene file.
  // When they do not load, or do not fit the board, the board keeps the scene
  // file layout.
  const layout = saved.then((positions) => {
    try {
      if (positions) {
        state.place(positions);
        return;
      }
    } catch (error) {
      console.warn("The saved moves do not fit the board:", error);
    }
    showNotice("Saved moves did not load");
  });

  // The board shows first. Each sprite stands on it when its image and the
  // positions load.
  let loaded = 0;
  for (const spec of file.sprites) {
    void Promise.all([loadSpriteVoxels(spec), layout]).then(([voxels]) => {
      sprites.add(spec, voxels, state.squareOf(spec.id));
      loaded++;
      requestDraw();
    });
  }

  exposeDiorama({
    board: file.board,
    view,
    sprites,
    state,
    drag,
    ready: () => loaded === file.sprites.length,
  });
}

async function main(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const name = params.get("scene") ?? "demo";
  // The positions load at the same time as the scene file.
  const saved = isSceneName(name)
    ? loadPositions(name).catch((error: unknown) => {
        console.warn("The saved moves did not load:", error);
        return null;
      })
    : Promise.resolve(null);
  try {
    showBoard(name, await loadScene(name), saved);
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
