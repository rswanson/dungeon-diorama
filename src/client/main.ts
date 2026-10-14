import { Color, OrthographicCamera, Scene, WebGLRenderer } from "three";
import "./style.css";

const DUNGEON = new Color("#14110f");
const MAX_PIXEL_RATIO = 2;
/** The half height of the view, in board units. */
const VIEW_HALF_HEIGHT = 10;

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
if (!canvas) throw new Error("The page has no #scene canvas.");

const renderer = new WebGLRenderer({ canvas, antialias: true });

const scene = new Scene();
scene.background = DUNGEON;

const camera = new OrthographicCamera();
camera.position.set(0, 0, 10);

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(width, height, false);

  const halfWidth = VIEW_HALF_HEIGHT * (width / height);
  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = VIEW_HALF_HEIGHT;
  camera.bottom = -VIEW_HALF_HEIGHT;
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
}

window.addEventListener("resize", resize);
resize();
