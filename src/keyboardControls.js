// KEYBOARD -> PARAMETERS -------------------------------------------------
// Cada parámetro tiene una tecla que lo sube y una que lo baja.
// Mantener presionada la tecla "rampea" el valor a `rate` unidades/segundo
// (como girar una perilla), en lugar de saltar de golpe.
// Esto es lo que permite conducir el sistema en tiempo real durante PERFORMANCE.
//
// Nota: 'KeyR', 'KeyP', 'Digit1'..'Digit5' y 'Space' ya están tomadas por
// main.js (reset, modo, presets, inversión radial), así que no se reutilizan aquí.

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createKeyboardControls(params) {
  const bindings = [
    {
      label: 'timeScale', up: 'KeyQ', down: 'KeyA', rate: 1.0, min: 0, max: 2,
      get: () => params.timeScale.value,
      set: (v) => { params.timeScale.value = v; }
    },
    {
      label: 'maxSpeed', up: 'KeyW', down: 'KeyS', rate: 6.0, min: 0.2, max: 12,
      get: () => params.maxSpeed.value,
      set: (v) => { params.maxSpeed.value = v; }
    },
    {
      label: 'particleSize', up: 'KeyE', down: 'KeyD', rate: 0.05, min: 0.005, max: 0.1,
      get: () => params.particleSize.value,
      set: (v) => { params.particleSize.value = v; }
    },
    {
      label: 'radialStrength', up: 'KeyT', down: 'KeyG', rate: 8.0, min: -8, max: 8,
      get: () => params.radialStrength.value,
      set: (v) => { params.radialStrength.value = v; }
    },
    {
      label: 'vortexStrength', up: 'KeyY', down: 'KeyH', rate: 8.0, min: -8, max: 8,
      get: () => params.vortexStrength.value,
      set: (v) => { params.vortexStrength.value = v; }
    },
    {
      label: 'dragCoefficient', up: 'KeyU', down: 'KeyJ', rate: 0.5, min: 0, max: 1,
      get: () => params.dragCoefficient.value,
      set: (v) => { params.dragCoefficient.value = v; }
    },
    {
      label: 'wind.x', up: 'KeyI', down: 'KeyK', rate: 4.0, min: -4, max: 4,
      get: () => params.wind.value.x,
      // Tocar el viento lo activa automáticamente: si no, mover wind.x
      // no tendría ningún efecto visible mientras windEnabled esté en 0.
      set: (v) => { params.wind.value.x = v; params.windEnabled.value = 1; }
    },
    {
      label: 'wind.y', up: 'KeyO', down: 'KeyL', rate: 4.0, min: -4, max: 4,
      get: () => params.wind.value.y,
      set: (v) => { params.wind.value.y = v; params.windEnabled.value = 1; }
    }
  ];

  const pressed = new Set();
  const relevantKeys = new Set(bindings.flatMap((b) => [b.up, b.down]));

  const onKeyDown = (event) => {
    if (relevantKeys.has(event.code)) pressed.add(event.code);
  };
  const onKeyUp = (event) => {
    pressed.delete(event.code);
  };

  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);

  return {
    bindings,
    // Llamar una vez por frame con el delta en segundos.
    // Devuelve true si algún parámetro cambió, para que quien llama
    // pueda refrescar la UI del panel LAB.
    update(dt) {
      let changed = false;
      for (const b of bindings) {
        let dir = 0;
        if (pressed.has(b.up)) dir += 1;
        if (pressed.has(b.down)) dir -= 1;
        if (dir === 0) continue;
        const current = b.get();
        const next = clamp(current + dir * b.rate * dt, b.min, b.max);
        if (next !== current) {
          b.set(next);
          changed = true;
        }
      }
      return changed;
    },
    dispose() {
      removeEventListener('keydown', onKeyDown);
      removeEventListener('keyup', onKeyUp);
    }
  };
}
