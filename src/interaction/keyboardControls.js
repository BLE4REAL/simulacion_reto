// KEYBOARD -> PARAMETERS -------------------------------------------------
// Cada parámetro tiene una tecla que lo sube y una que lo baja.
// Mantener presionada la tecla "rampea" el valor a `rate` unidades/segundo.

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createKeyboardControls(params, callbacks = {}) {
  const { onToggleCamera, onZoom } = callbacks;

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
      set: (v) => { params.wind.value.x = v; params.windEnabled.value = 1; }
    },
    {
      label: 'wind.y', up: 'KeyO', down: 'KeyL', rate: 4.0, min: -4, max: 4,
      get: () => params.wind.value.y,
      set: (v) => { params.wind.value.y = v; params.windEnabled.value = 1; }
    },
    {
      label: 'sizeVariation', up: 'KeyZ', down: 'KeyX', rate: 0.6, min: 0, max: 1.5,
      get: () => params.sizeVariation.value,
      set: (v) => { params.sizeVariation.value = v; }
    }
  ];

  const pressed = new Set();
  const relevantKeys = new Set([
    ...bindings.flatMap((b) => [b.up, b.down]),
    'KeyV',
    'KeyB'
  ]);

  const onKeyDown = (event) => {
    if (relevantKeys.has(event.code)) pressed.add(event.code);

    // Conmutador de órbita de cámara con la tecla C
    if (event.code === 'KeyC' && !event.repeat) {
      onToggleCamera?.();
    }
  };

  const onKeyUp = (event) => {
    pressed.delete(event.code);
  };

  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);

  const ZOOM_RATE = 6.0; // Unidades de distancia por segundo

  return {
    bindings,
    update(dt) {
      let changed = false;

      // Parámetros de simulación
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

      // Control continuo de Zoom (V: acercar hacia el núcleo / B: alejar)
      if (pressed.has('KeyV')) {
        onZoom?.(-ZOOM_RATE * dt);
      }
      if (pressed.has('KeyB')) {
        onZoom?.(ZOOM_RATE * dt);
      }

      return changed;
    },
    dispose() {
      removeEventListener('keydown', onKeyDown);
      removeEventListener('keyup', onKeyUp);
    }
  };
}
