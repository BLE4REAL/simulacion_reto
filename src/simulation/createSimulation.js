import * as THREE from 'three/webgpu';
import {
    Fn,
    If,
    abs,
    color,
    hash,
    instanceIndex,
    instancedArray,
    max,
    mix,
    pow,
    uint,
    vec3,
    vec4,
    positionLocal
} from 'three/tsl';

export function createSimulation({ renderer, scene, params, count = 131072, customGeometry }) {
    // STATE -----------------------------------------------------------------
    const positionBuffer = instancedArray(count, 'vec3');
    const velocityBuffer = instancedArray(count, 'vec3');

    // INITIALIZATION --------------------------------------------------------
    const initParticles = Fn(() => {
        const i = instanceIndex;
        const p = positionBuffer.element(i);
        const v = velocityBuffer.element(i);

        const r1 = hash(i.add(uint(11)));
        const r2 = hash(i.add(uint(23)));
        const r3 = hash(i.add(uint(37)));
        const r4 = hash(i.add(uint(53)));
        const r5 = hash(i.add(uint(71)));
        const r6 = hash(i.add(uint(89)));
        const r7 = hash(i.add(uint(101)));

        const direction = vec3(r1, r2, r3).sub(0.5).normalize();
        const radius = pow(r7, 1.0 / 3.0).mul(params.boundsRadius).mul(0.9);
        p.assign(direction.mul(radius));
        v.assign(vec3(r4, r5, r6).sub(0.5).mul(params.initialSpeed));
    })().compute(count).setName('Initialize Particles');

    // UPDATE / COMPUTE SHADER ----------------------------------------------
    const updateParticles = Fn(() => {
        const p = positionBuffer.element(instanceIndex);
        const v = velocityBuffer.element(instanceIndex);

        const dt = params.dt.mul(params.timeScale);
        const force = vec3(0.0).toVar();

        // 1) CONSTANT / WIND FORCE
        force.addAssign(params.wind.mul(params.windEnabled));

        // 2) NÚCLEO
        const toCore = params.attractor.sub(p);
        const distanceCore = max(toCore.length(), params.softening);
        const coreDirection = toCore.div(distanceCore);

        const radialForce = coreDirection
            .mul(params.radialStrength)
            .div(distanceCore.pow(2))
            .mul(params.radialEnabled);
        force.addAssign(radialForce);

        const axisX = hash(instanceIndex.add(uint(301))).sub(0.5);
        const axisY = hash(instanceIndex.add(uint(401))).sub(0.5);
        const axisZ = hash(instanceIndex.add(uint(503))).sub(0.5);
        const axis = vec3(axisX, axisY, axisZ).normalize();
        const tangent = axis.cross(coreDirection);

        const orbitalSpeed = pow(abs(params.radialStrength).div(distanceCore), 0.5);
        force.addAssign(tangent.mul(params.vortexStrength).mul(orbitalSpeed).mul(params.vortexEnabled));

        // 3) LINEAR DRAG: F = -c v
        force.addAssign(v.mul(params.dragCoefficient).mul(params.dragEnabled).mul(-1.0));

        // INTEGRATION ---------------------------------------------------------
        v.addAssign(force.mul(dt));

        const speed = v.length();
        If(speed.greaterThan(params.maxSpeed), () => {
            v.assign(v.normalize().mul(params.maxSpeed));
        });

        p.addAssign(v.mul(dt));

        // SPHERE BOUNDARY
        const distFromCenter = p.length();
        If(distFromCenter.greaterThan(params.boundsRadius), () => {
            const normal = p.normalize();
            const vDotN = v.dot(normal);
            v.assign(v.sub(normal.mul(vDotN).mul(2.0)));
            p.assign(normal.mul(params.boundsRadius));
        });
    })().compute(count).setName('Update Particles');

    // RENDER ---------------------------------------------------------------

    // CAMBIO VISUAL: NormalBlending y depthWrite = true crea objetos físicos, no luz.
    const material = new THREE.MeshBasicNodeMaterial({
        blending: THREE.NormalBlending,
        depthWrite: true,
        transparent: false,
        side: THREE.DoubleSide
    });

    const particleScale = Fn(() => {
        const sizeHash = hash(instanceIndex.add(uint(211)));
        const variation = sizeHash.sub(0.5).mul(2.0).mul(params.sizeVariation);
        const factor = variation.add(1.0).max(0.15);
        return params.particleSize.mul(factor);
    })();

    material.positionNode = positionLocal.mul(particleScale).add(positionBuffer.toAttribute());

    // CAMBIO VISUAL: Paleta de Pétalo Rosado a Verde Jade según la velocidad
    material.colorNode = Fn(() => {
        const speed = velocityBuffer.toAttribute().length();
        const t = speed.div(params.maxSpeed).clamp(0.0, 1.0);
        const lotusPink = color('#ffb7c5'); // Rosa de pétalo
        const jadeGreen = color('#00a86b'); // Verde Jade
        return vec4(mix(lotusPink, jadeGreen, t), 1.0);
    })();

    const geometry = customGeometry || new THREE.TetrahedronGeometry(1, 0);
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.frustumCulled = false;
    scene.add(mesh);

    function reset() {
        renderer.compute(initParticles);
    }

    function stepSimulation() {
        renderer.compute(updateParticles);
    }

    function dispose() {
        geometry.dispose();
        material.dispose();
        scene.remove(mesh);
    }

    return {
        count,
        positionBuffer,
        velocityBuffer,
        reset,
        stepSimulation,
        dispose
    };
}