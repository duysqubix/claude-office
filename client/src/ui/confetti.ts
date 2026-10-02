// A burst of paper confetti off a button (UX.md §1.1: "You hired them"). DOM only, about a
// second, then gone. Skipped entirely under reduced motion.
import { PALETTE } from '../style/palette';

const COLORS = [PALETTE.claude, '#5CC8FF', '#FFC94A', '#8FE0C8', '#FF7EB6', '#9B5DE5', '#FFFDF7'];

export function calmMotion(): boolean {
  return document.documentElement.classList.contains('co-calm') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Throw `n` pieces up and out from the centre of `from`. */
export function confetti(from: Element | DOMRect, n = 24): void {
  if (calmMotion()) return;
  const r = from instanceof Element ? from.getBoundingClientRect() : from;
  const x0 = r.left + r.width / 2;
  const y0 = r.top + r.height / 2;
  const layer = document.createElement('div');
  layer.className = 'co-confetti';
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);
  let left = n;
  for (let i = 0; i < n; i++) {
    const piece = document.createElement('i');
    const w = 6 + Math.random() * 6;
    piece.style.cssText = `left:${x0}px;top:${y0}px;width:${w}px;height:${w * (0.45 + Math.random() * 0.5)}px;background:${COLORS[i % COLORS.length]}`;
    layer.append(piece);
    // Up and out, then gravity: a fan of -150°…-30° from the button.
    const angle = (-150 + Math.random() * 120) * (Math.PI / 180);
    const speed = 140 + Math.random() * 180;
    const dx = Math.cos(angle) * speed;
    const dy = Math.sin(angle) * speed;
    const spin = (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 540);
    const ms = 900 + Math.random() * 400;
    const anim = piece.animate(
      [
        { transform: 'translate(-50%, -50%) rotate(0deg)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx * 0.6}px), calc(-50% + ${dy * 0.6}px)) rotate(${spin * 0.5}deg)`, opacity: 1, offset: 0.35 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy * 0.4 + 260}px)) rotate(${spin}deg)`, opacity: 0 },
      ],
      { duration: ms, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' },
    );
    anim.onfinish = () => {
      if (--left === 0) layer.remove();
    };
  }
}
