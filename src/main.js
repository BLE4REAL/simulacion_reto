import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import './styles.css';

import florLotoUrl from './Flor_loto.glb?url';
import { createParameters } from './simulation/parameters.js';
import { createSimulation } from './simulation/createSimulation.js';
import { createLabPanel } from './ui/labPanel.js';
import { createKeyboardControls } from './interaction/keyboardControls.js';

const PARTICLE_COUNT = 131072;

// FUNCIONES MATEMÁTICAS PARA TRANSICIONES FLUIDAS
const lerp = (start, end, t) => start * (1 - t) + end * t;
const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

async function main() {
    const mount = document.querySelector('#app');

    if (!WebGPU.isAvailable()) {
        mount.appendChild(WebGPU.getErrorMessage());
        throw new Error('Este proyecto requiere WebGPU para ejecutar compute shaders.');
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#071410');

    const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 100);
    camera.position.set(0, 0, 11);

    const renderer = new THREE.WebGPURenderer({
        antialias: true,
        powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    mount.appendChild(renderer.domElement);
    await renderer.init();

    const params = createParameters();

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.enablePan = false;
    orbit.target.copy(params.attractor.value);

    const loader = new GLTFLoader();
    let customGeometry = null;

    try {
        const gltf = await loader.loadAsync(florLotoUrl);
        gltf.scene.traverse((child) => {
            if (child.isMesh && !customGeometry) {
                customGeometry = child.geometry.clone();
                customGeometry.center();
                customGeometry.computeBoundingBox();
                const size = new THREE.Vector3();
                customGeometry.boundingBox.getSize(size);
                const maxDim = Math.max(size.x, size.y, size.z);
                if (maxDim > 0) {
                    customGeometry.scale(1 / maxDim, 1 / maxDim, 1 / maxDim);
                }
            }
        });
    } catch (err) {
        console.error('Error cargando Flor_loto.glb', err);
    }

    const simulation = createSimulation({
        renderer,
        scene,
        params,
        count: PARTICLE_COUNT,
        customGeometry
    });

    const attractorHelper = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 16, 12),
        new THREE.MeshBasicMaterial({ color: '#ffffff' })
    );
    scene.add(attractorHelper);
    const axes = new THREE.AxesHelper(1.5);
    scene.add(axes);
    const boundsHelper = new THREE.Mesh(
        new THREE.SphereGeometry(params.boundsRadius.value, 24, 16),
        new THREE.MeshBasicMaterial({ color: '#00a86b', wireframe: true, transparent: true, opacity: 0.12 })
    );
    scene.add(boundsHelper);

    const CORE_SPEED = 2.4;
    const arrowKeys = new Set();
    const prevCorePos = new THREE.Vector3();

    addEventListener('keydown', (event) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
            event.preventDefault();
            arrowKeys.add(event.code);
        }
    });
    addEventListener('keyup', (event) => arrowKeys.delete(event.code));

    function updateCore(dt) {
        prevCorePos.copy(params.attractor.value);
        let dx = 0, dy = 0;
        if (arrowKeys.has('ArrowLeft')) dx -= 1;
        if (arrowKeys.has('ArrowRight')) dx += 1;
        if (arrowKeys.has('ArrowUp')) dy += 1;
        if (arrowKeys.has('ArrowDown')) dy -= 1;

        if (dx !== 0 || dy !== 0) {
            params.attractor.value.x += dx * CORE_SPEED * dt;
            params.attractor.value.y += dy * CORE_SPEED * dt;
            const maxReach = params.boundsRadius.value * 0.85;
            const len = params.attractor.value.length();
            if (len > maxReach) params.attractor.value.multiplyScalar(maxReach / len);
        }
        attractorHelper.position.copy(params.attractor.value);

        const deltaCore = params.attractor.value.clone().sub(prevCorePos);
        if (!cameraOrbitActive && deltaCore.lengthSq() > 0) {
            camera.position.add(deltaCore);
        }
    }

    let cameraOrbitActive = false;
    let orbitAngle = 0;
    let orbitPhase = 'horizontal';
    const ORBIT_SPEED = 0.35;
    let orbitRadius = 11;
    const MIN_RADIUS = 2.0;
    const MAX_RADIUS = 30.0;

    function handleZoom(delta) {
        const core = params.attractor.value;
        const currentDist = camera.position.distanceTo(core);
        orbitRadius = Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, currentDist + delta));
        const dir = camera.position.clone().sub(core);
        if (dir.lengthSq() < 0.0001) dir.set(0, 0, 1);
        dir.normalize();
        camera.position.copy(core.clone().add(dir.multiplyScalar(orbitRadius)));
    }

    function updateCameraOrbit(dt) {
        const core = params.attractor.value;
        if (!cameraOrbitActive) return;
        orbitAngle += ORBIT_SPEED * dt;
        if (orbitAngle >= Math.PI * 2) {
            orbitAngle -= Math.PI * 2;
            orbitPhase = orbitPhase === 'horizontal' ? 'vertical' : 'horizontal';
        }
        if (orbitPhase === 'horizontal') {
            const x = orbitRadius * Math.sin(orbitAngle);
            const z = orbitRadius * Math.cos(orbitAngle);
            camera.position.set(core.x + x, core.y, core.z + z);
            camera.up.set(0, 1, 0);
        } else {
            const y = orbitRadius * Math.sin(orbitAngle);
            const z = orbitRadius * Math.cos(orbitAngle);
            camera.position.set(core.x, core.y + y, core.z + z);
            camera.up.set(0, Math.cos(orbitAngle), -Math.sin(orbitAngle));
        }
    }

    let paused = false;
    let mode = 'LAB';
    let panel;
    let savedRadialStrength = params.radialStrength.value;
    let savedRadialEnabled = params.radialEnabled.value;

    let perfHud, perfBars;

    // ==========================================================
    // SISTEMA DE MACROS CONTINUAS (TWEENING)
    // ==========================================================
    let targetState = null;
    let startState = null;
    let transitionProgress = 0;
    let transitionDuration = 2.0; // segundos

    const applyMacro = (id) => {
        // 1. Guardar el estado exacto de este fotograma
        startState = {
            timeScale: params.timeScale.value,
            maxSpeed: params.maxSpeed.value,
            particleSize: params.particleSize.value,
            radialStrength: params.radialStrength.value,
            vortexStrength: params.vortexStrength.value,
            dragCoefficient: params.dragCoefficient.value,
            windX: params.wind.value.x,
            windY: params.wind.value.y
        };

        targetState = { ...startState };
        transitionProgress = 0;

        // 2. Definir los destinos según la canción LesAlpx
        if (id === 'buildUp') {
            // 7: TENSIÓN ATMOSFÉRICA - Lento, denso, flotante
            targetState.timeScale = 0.6;
            targetState.maxSpeed = 3.0;
            targetState.radialStrength = 0.5; // Atracción muy suave
            targetState.vortexStrength = 1.5;
            targetState.dragCoefficient = 0.6; // Mucha fricción
            targetState.windX = 0.2;

            params.radialEnabled.value = 1;
            params.vortexEnabled.value = 1;
            params.dragEnabled.value = 1;
            transitionDuration = 3.0; // Transición muy lenta (3 segundos)
        }
        else if (id === 'drop') {
            // 8: IMPLOSIÓN / DROP - Colapso agresivo hacia el núcleo rosa
            targetState.timeScale = 1.2;
            targetState.maxSpeed = 10.0;
            targetState.radialStrength = 6.0; // Atracción brutal
            targetState.vortexStrength = 4.0;
            targetState.dragCoefficient = 0.1; // Se sueltan
            targetState.windX = 0.0;

            params.radialEnabled.value = 1;
            params.vortexEnabled.value = 1;
            params.dragEnabled.value = 1;
            transitionDuration = 1.0; // Transición rápida (1 segundo)
        }
        else if (id === 'euphoria') {
            // 9: EXPANSIÓN ANILLO - Explota hacia afuera en un anillo masivo
            targetState.timeScale = 1.0;
            targetState.maxSpeed = 8.0;
            targetState.radialStrength = -7.0; // Repulsión brutal
            targetState.vortexStrength = 14.0; // Gira rapidísimo
            targetState.dragCoefficient = 0.45; // Los frena en su órbita
            targetState.windX = 0.5;

            params.radialEnabled.value = 1;
            params.vortexEnabled.value = 1;
            params.dragEnabled.value = 1;
            transitionDuration = 1.5; // Expansión controlada
        }
    };

    const applyPreset = (id) => {
        // ESTO SÍ HACE RESET (Pruebas del 1 al 6)
        params.windEnabled.value = 0;
        params.radialEnabled.value = 0;
        params.vortexEnabled.value = 0;
        params.dragEnabled.value = 0;
        params.wind.value.set(0, 0, 0);
        params.initialSpeed.value = 0;
        params.attractor.value.set(0, 0, 0);
        targetState = null; // Cancelar macros si las hay

        if (id === 'inertia') params.initialSpeed.value = 0.8;
        else if (id === 'wind') { params.windEnabled.value = 1; params.wind.value.set(1.5, 0, 0); }
        else if (id === 'attract') { params.radialEnabled.value = 1; params.radialStrength.value = 3.0; }
        else if (id === 'repel') { params.radialEnabled.value = 1; params.radialStrength.value = -3.0; }
        else if (id === 'vortex') {
            params.radialEnabled.value = 1; params.radialStrength.value = 1.0;
            params.vortexEnabled.value = 1; params.vortexStrength.value = 3.0;
            params.dragEnabled.value = 1; params.dragCoefficient.value = 0.08;
        } else if (id === 'ring') {
            params.timeScale.value = 1.0; params.maxSpeed.value = 8.0;
            params.particleSize.value = 0.012; params.sizeVariation.value = 0.02;
            params.radialEnabled.value = 1; params.radialStrength.value = -6.5;
            params.vortexEnabled.value = 1; params.vortexStrength.value = 12.0;
            params.dragEnabled.value = 1; params.dragCoefficient.value = 0.45;
            params.windEnabled.value = 1; params.wind.value.set(0.5, 0.5, 0.0);
            params.attractor.value.set(1.8, 0.4, 0.0);
        }
        simulation.reset();
        panel?.refresh();
    };

    const setMode = (next) => {
        mode = next;
        const lab = mode === 'LAB';
        panel.setVisible(lab);
        axes.visible = lab;
        attractorHelper.visible = lab;
        boundsHelper.visible = lab;

        if (perfHud) perfHud.classList.toggle('hidden', lab);

        hud.innerHTML = lab
            ? '<strong>LAB</strong> · P: performance · C: órbita 360° · R: reset · 1–6: pruebas · 7-9: MACROS · flechas: núcleo · Q/A..Z/X: parámetros'
            : '<strong>PERFORMANCE</strong> · P: lab · C: órbita 360° · 7: Tensión · 8: Implosión · 9: Anillo Expansivo · flechas: núcleo · Q/A..Z/X: parámetros';
    };

    panel = createLabPanel({
        params,
        onReset: () => simulation.reset(),
        onPreset: applyPreset,
        onMacro: applyMacro, // Pasamos la nueva función al panel
        onModeChange: () => setMode(mode === 'LAB' ? 'PERFORMANCE' : 'LAB'),
        onPauseChange: () => paused = !paused
    });

    const keyboardControls = createKeyboardControls(params, {
        onToggleCamera: () => { cameraOrbitActive = !cameraOrbitActive; },
        onZoom: (delta) => { handleZoom(delta); }
    });

    const clock = new THREE.Clock();

    const hud = document.createElement('div');
    hud.className = 'hud';
    document.body.append(hud);

    perfHud = document.createElement('div');
    perfHud.className = 'perf-hud hidden';
    document.body.append(perfHud);

    perfBars = keyboardControls.bindings.map(b => {
        const row = document.createElement('div');
        row.className = 'perf-row';
        const label = document.createElement('span');
        label.textContent = b.label.split(' ')[0];
        const barBg = document.createElement('div');
        barBg.className = 'perf-bar-bg';
        const barFill = document.createElement('div');
        barFill.className = 'perf-bar-fill';
        barBg.append(barFill);
        row.append(label, barBg);
        perfHud.append(row);
        return { binding: b, fill: barFill };
    });

    setMode('LAB');

    addEventListener('keydown', (event) => {
        if (event.repeat) return;
        if (event.code === 'KeyP') setMode(mode === 'LAB' ? 'PERFORMANCE' : 'LAB');
        if (event.code === 'KeyR') applyPreset('inertia'); // Reset suave

        // Pruebas (Con reset)
        if (event.code === 'Digit1') applyPreset('inertia');
        if (event.code === 'Digit2') applyPreset('wind');
        if (event.code === 'Digit3') applyPreset('attract');
        if (event.code === 'Digit4') applyPreset('repel');
        if (event.code === 'Digit5') applyPreset('vortex');
        if (event.code === 'Digit6') applyPreset('ring');

        // Macros Fluidas (Sin reset)
        if (event.code === 'Digit7') applyMacro('buildUp');
        if (event.code === 'Digit8') applyMacro('drop');
        if (event.code === 'Digit9') applyMacro('euphoria');

        if (event.code === 'Space') {
            event.preventDefault();
            savedRadialStrength = params.radialStrength.value;
            savedRadialEnabled = params.radialEnabled.value;
            params.radialEnabled.value = 1;
            params.radialStrength.value = -(savedRadialStrength || 2.0);
            panel.refresh();
        }
    });

    addEventListener('keyup', (event) => {
        if (event.code === 'Space') {
            params.radialEnabled.value = savedRadialEnabled;
            params.radialStrength.value = savedRadialStrength;
            panel.refresh();
        }
    });

    addEventListener('resize', () => {
        camera.aspect = innerWidth / innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(innerWidth, innerHeight);
    });

    simulation.reset();

    // FRAME LOOP ------------------------------------------------------------
    renderer.setAnimationLoop(() => {
        const dt = clock.getDelta();
        const core = params.attractor.value;

        updateCore(dt);
        updateCameraOrbit(dt);
        orbit.target.copy(core);
        orbitRadius = camera.position.distanceTo(core);

        // EJECUCIÓN DE LAS MACROS (INTERPOLACIÓN FLUIDA)
        if (targetState && startState) {
            transitionProgress += dt / transitionDuration;
            if (transitionProgress >= 1) transitionProgress = 1;

            const t = easeInOutCubic(transitionProgress);

            params.timeScale.value = lerp(startState.timeScale, targetState.timeScale, t);
            params.maxSpeed.value = lerp(startState.maxSpeed, targetState.maxSpeed, t);
            params.particleSize.value = lerp(startState.particleSize, targetState.particleSize, t);
            params.radialStrength.value = lerp(startState.radialStrength, targetState.radialStrength, t);
            params.vortexStrength.value = lerp(startState.vortexStrength, targetState.vortexStrength, t);
            params.dragCoefficient.value = lerp(startState.dragCoefficient, targetState.dragCoefficient, t);
            params.wind.value.x = lerp(startState.windX, targetState.windX, t);
            params.wind.value.y = lerp(startState.windY, targetState.windY, t);

            panel?.refresh();

            if (transitionProgress === 1) targetState = null; // Termina la transición
        }

        const changedByKeyboard = keyboardControls.update(dt);
        if (changedByKeyboard) {
            targetState = null; // Si tocas el teclado manual, se interrumpe la macro automática
            panel.refresh();
        }

        if (mode === 'PERFORMANCE' && perfBars) {
            perfBars.forEach(b => {
                const val = b.binding.get();
                const min = b.binding.min;
                const max = b.binding.max;
                const pct = Math.max(0, Math.min(1, (val - min) / (max - min))) * 100;
                b.fill.style.width = `${pct}%`;
            });
        }

        if (!paused) simulation.stepSimulation();
        orbit.update();
        renderer.render(scene, camera);
    });
}

main().catch((error) => {
    console.error(error);
    const pre = document.createElement('pre');
    pre.style.cssText = 'position:fixed;inset:16px;white-space:pre-wrap;color:#fff;z-index:50';
    pre.textContent = String(error?.stack || error);
    document.body.append(pre);
});