// The Midnight Teller — input.js
// Keyboard + mouse, tracked as named actions so the game loop never reads
// raw event codes. WASD/arrows move, Shift sprints, E interacts, Space is
// the safe-cracking tap, 1/2/3 fire tools, mouse aims the decoy throw.

export function attachInput(canvas) {
  const keys = new Set();
  const mouse = { x: 0, y: 0, clicked: false, down: false };
  const pressed = new Set(); // edge-triggered keys, consumed by the loop

  const keyName = (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    return k;
  };

  window.addEventListener('keydown', (e) => {
    const k = keyName(e);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
      e.preventDefault();
    }
    if (!e.repeat) pressed.add(k);
    keys.add(k);
  });
  window.addEventListener('keyup', (e) => keys.delete(keyName(e)));
  window.addEventListener('blur', () => keys.clear());

  const toGame = (e) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 1280,
      y: ((e.clientY - rect.top) / rect.height) * 720,
    };
  };
  canvas.addEventListener('mousemove', (e) => {
    const p = toGame(e);
    mouse.x = p.x;
    mouse.y = p.y;
  });
  canvas.addEventListener('mousedown', (e) => {
    const p = toGame(e);
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.down = true;
    mouse.clicked = true;
  });
  window.addEventListener('mouseup', () => {
    mouse.down = false;
  });

  return {
    keys,
    mouse,
    // True once per physical press; the loop calls this every frame.
    wasPressed(k) {
      if (pressed.has(k)) {
        pressed.delete(k);
        return true;
      }
      return false;
    },
    // Movement vector from WASD/arrows, normalised.
    moveVector() {
      let x = 0;
      let y = 0;
      if (keys.has('a') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('d') || keys.has('ArrowRight')) x += 1;
      if (keys.has('w') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('s') || keys.has('ArrowDown')) y += 1;
      if (x !== 0 && y !== 0) {
        const inv = 1 / Math.hypot(x, y);
        x *= inv;
        y *= inv;
      }
      return { x, y };
    },
    sprinting() {
      return keys.has('Shift');
    },
  };
}
