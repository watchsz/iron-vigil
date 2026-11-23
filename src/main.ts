import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: false });
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a0505);
scene.fog = new THREE.Fog(0x1a0505, 4, 14);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
camera.position.set(0, 4, 7);
camera.lookAt(0, 0, 0);

scene.add(new THREE.HemisphereLight(0x8a6a5a, 0x100808, 2));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshLambertMaterial({ color: 0x2b2620 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const keep = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshLambertMaterial({ color: 0x55504a }));
keep.position.y = 1;
scene.add(keep);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

let frames = 0;
renderer.setAnimationLoop((t) => {
  frames++;
  keep.rotation.y = t / 2000;
  renderer.render(scene, camera);
});

// Hook de test e2e ; s'étoffera avec la sim (seed, pause, avance N ticks).
(window as unknown as { __game: object }).__game = {
  ready: true,
  frames: () => frames,
  drawCalls: () => renderer.info.render.calls,
};
