import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const COUNT = 8;
const RADII = [1.32, 1.26, 1.2, 1.12, 1.03, 0.93, 0.82, 0.7];
const CAL = 0xff6f1f; const PRO = 0x2bb3f5;

// A real 3D barbell. Calories load the left, protein the right. It sways by itself and spins when dragged.
export default function Bar3D({ c, p }) {
  const mount = useRef(null);
  const state = useRef({ c, p });
  state.current.c = c; state.current.p = p;

  useEffect(() => {
    const el = mount.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    el.append(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    scene.environment = pmrem.fromScene(room, 0.04).texture;
    const camera = new THREE.PerspectiveCamera(30, 2, 0.1, 50);
    camera.position.set(0, 0.5, 9.4);
    camera.lookAt(0, -0.05, 0);
    const key = new THREE.DirectionalLight(0xffa268, 3.2); key.position.set(-5, 4, 5); scene.add(key);
    const rim = new THREE.DirectionalLight(0x6fd0ff, 3); rim.position.set(6, 2, -2); scene.add(rim);

    const rig = new THREE.Group(); scene.add(rig);
    const steel = new THREE.MeshStandardMaterial({ color: 0xc9d2da, metalness: 1, roughness: 0.22 });
    const axisX = (mesh) => { mesh.rotation.z = Math.PI / 2; return mesh; };
    rig.add(axisX(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 7.8, 24), steel)));
    for (const s of [-1, 1]) {
      const collar = axisX(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.22, 28), steel));
      collar.position.x = s * 1.32; rig.add(collar);
    }
    const geos = [];
    const plates = [];
    const makeSide = (side, color) => {
      RADII.forEach((r, i) => {
        const profile = [
          new THREE.Vector2(0.13, -0.085), new THREE.Vector2(r - 0.05, -0.085), new THREE.Vector2(r, -0.05), new THREE.Vector2(r, 0.05),
          new THREE.Vector2(r - 0.05, 0.085), new THREE.Vector2(0.13, 0.085),
        ];
        const geo = new THREE.LatheGeometry(profile, 56); geos.push(geo);
        const mat = new THREE.MeshStandardMaterial({ color: 0x24384a, metalness: 0.75, roughness: 0.42, transparent: true, opacity: 0.4 });
        const mesh = axisX(new THREE.Mesh(geo, mat));
        const home = side * (1.53 + i * 0.205);
        mesh.position.x = home;
        rig.add(mesh);
        plates.push({ mesh, mat, side, i, home, on: 0, target: 0, color: new THREE.Color(color), off: new THREE.Color(0x24384a), slide: 0 });
      });
    };
    makeSide(-1, CAL); makeSide(1, PRO);

    let spin = 0; let vel = 0; let dragging = false; let lastX = 0; let bounce = 0; let bounceV = 0; let tilt = 0;
    const onDown = (e) => { dragging = true; lastX = e.clientX; };
    const onMove = (e) => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; vel = dx * 0.006; spin += vel; };
    const onUp = () => { dragging = false; };
    const cv = renderer.domElement;
    cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);

    const resize = () => {
      const w = el.clientWidth || 360; const h = el.clientHeight || 190;
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();

    let visible = true; let raf = 0; let last = performance.now();
    const clock = () => {
      raf = 0;
      if (!visible || document.hidden) return;
      const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const { c: cc, p: pp } = state.current;
      const t = now / 1000;
      let added = false;
      for (const pl of plates) {
        const pct = pl.side < 0 ? cc : pp;
        const fill = Math.max(0, Math.min(1, Math.min(1, pct) * COUNT - pl.i));
        if (fill > 0 && pl.target === 0) { pl.slide = 1; added = true; }
        pl.target = fill;
        pl.on += (fill - pl.on) * Math.min(1, dt * 7);
        pl.slide *= Math.exp(-dt * 9);
        pl.mesh.position.x = pl.home + pl.side * pl.slide * 1.4;
        const k = pl.on > 0.01 ? 0.35 + 0.65 * pl.on : 0;
        pl.mat.color.copy(pl.off).lerp(pl.color, k);
        pl.mat.emissive.copy(pl.color); pl.mat.emissiveIntensity = k * 0.28;
        pl.mat.opacity = 0.4 + 0.6 * Math.min(1, k * 1.6);
        pl.mat.metalness = 0.75 - k * 0.2; pl.mat.roughness = 0.42 - k * 0.14;
      }
      if (added) bounceV = -2.2;
      bounceV += (-bounce * 90 - bounceV * 9) * dt; bounce += bounceV * dt;
      if (!dragging) { spin += vel; vel *= Math.exp(-dt * 2.5); spin *= Math.exp(-dt * 0.5); }
      const wantTilt = Math.max(-0.1, Math.min(0.1, (Math.min(pp, 1) - Math.min(cc, 1)) * 0.2));
      tilt += (wantTilt - tilt) * Math.min(1, dt * 4);
      rig.rotation.y = 0.42 * Math.sin(t * 0.55) + spin;
      rig.rotation.x = 0.13 + 0.05 * Math.sin(t * 0.8);
      rig.rotation.z = -tilt;
      rig.position.y = 0.06 * Math.sin(t * 1.1) + bounce;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(clock);
    };
    const kick = () => { if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(clock); } };
    // Saves battery: stops drawing when scrolled away or the app is in the background.
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; kick(); }); io.observe(el);
    document.addEventListener('visibilitychange', kick);
    kick();

    return () => {
      cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); document.removeEventListener('visibilitychange', kick);
      cv.removeEventListener('pointerdown', onDown); cv.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
      geos.forEach((g) => g.dispose()); plates.forEach((pl) => pl.mat.dispose()); steel.dispose(); room.dispose?.(); pmrem.dispose(); scene.environment?.dispose?.();
      renderer.dispose(); renderer.forceContextLoss?.(); cv.remove();
    };
  }, []);

  return <div ref={mount} className="bar3d" />;
}
