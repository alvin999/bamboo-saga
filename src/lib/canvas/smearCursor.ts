/**
 * Smear Cursor 物理殘影游標
 * 透過雙阻尼粒子插值演算法，在游標跳躍或移動時繪製 Gruvbox 暖色漸層殘影
 */

export interface CursorRect {
  left: number;
  top: number;
  height: number;
  width: number;
}

export class SmearCursorRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animId: number | null = null;

  // 物理狀態
  private current = { x: 0, y: 0, height: 20, width: 2.5 };
  private target = { x: 0, y: 0, height: 20, width: 2.5 };
  private tail = { x: 0, y: 0, height: 20 };
  private velocity = { x: 0, y: 0 };
  private opacity = 0;
  private isMoving = false;
  private hasInitialized = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Cannot get 2D context from canvas');
    this.ctx = ctx;
    this.resize();
  }

  public resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.resetTransform?.();
    this.ctx.scale(dpr, dpr);
  }

  public updateTarget(rect: CursorRect) {
    const canvasBounds = this.canvas.getBoundingClientRect();
    const relX = rect.left - canvasBounds.left;
    const relY = rect.top - canvasBounds.top;

    if (!this.hasInitialized) {
      this.current.x = relX;
      this.current.y = relY;
      this.current.height = rect.height;
      this.current.width = Math.max(rect.width, 2.5);
      this.target = { ...this.current };
      this.tail = { x: relX, y: relY, height: rect.height };
      this.hasInitialized = true;
      return;
    }

    const dist = Math.hypot(relX - this.target.x, relY - this.target.y);
    if (dist > 3) {
      // 游標大幅或快速移動
      this.target.x = relX;
      this.target.y = relY;
      this.target.height = rect.height;
      this.target.width = Math.max(rect.width, 2.5);
      this.isMoving = true;
      this.opacity = Math.min(this.opacity + 0.4, 0.95);
      this.startLoop();
    }
  }

  private startLoop() {
    if (this.animId === null) {
      this.animId = requestAnimationFrame(this.renderStep.bind(this));
    }
  }

  private renderStep() {
    // 雙阻尼物理模擬 (Spring / Damping)
    const stiffness = 0.42; // 頭部追隨彈力
    const tailStiffness = 0.22; // 尾部滯後阻尼
    const friction = 0.72;

    const dx = this.target.x - this.current.x;
    const dy = this.target.y - this.current.y;

    this.velocity.x = (this.velocity.x + dx * stiffness) * friction;
    this.velocity.y = (this.velocity.y + dy * stiffness) * friction;

    this.current.x += this.velocity.x;
    this.current.y += this.velocity.y;
    this.current.height += (this.target.height - this.current.height) * 0.3;

    // 尾部慢慢追逐 current
    this.tail.x += (this.current.x - this.tail.x) * tailStiffness;
    this.tail.y += (this.current.y - this.tail.y) * tailStiffness;
    this.tail.height += (this.current.height - this.tail.height) * tailStiffness;

    // 清理畫布
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width, rect.height);

    const distToTarget = Math.hypot(this.target.x - this.current.x, this.target.y - this.current.y);
    const trailDist = Math.hypot(this.current.x - this.tail.x, this.current.y - this.tail.y);

    if (distToTarget < 0.5 && trailDist < 0.8) {
      // 游標接近靜止，平滑淡出
      this.opacity *= 0.82;
      if (this.opacity < 0.02) {
        this.opacity = 0;
        this.isMoving = false;
        this.animId = null;
        return; // 結束動畫節省效能
      }
    }

    if (this.opacity > 0 && trailDist > 1) {
      this.drawSmear(this.current, this.tail, this.opacity);
    }

    this.animId = requestAnimationFrame(this.renderStep.bind(this));
  }

  private drawSmear(
    head: { x: number; y: number; height: number },
    tail: { x: number; y: number; height: number },
    opacity: number
  ) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = opacity;

    // Gruvbox 橘紅至金黃色漸層 (#fe8019 -> #fabd2f)
    const grad = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
    grad.addColorStop(0, 'rgba(254, 128, 25, 0.08)');
    grad.addColorStop(0.5, 'rgba(254, 128, 25, 0.45)');
    grad.addColorStop(1, 'rgba(250, 189, 47, 0.85)');

    ctx.fillStyle = grad;
    ctx.beginPath();

    // 繪製頭部到尾部的凸包殘影多邊形
    const hHalfW = 1.6;
    const tHalfW = 1.0;

    // 頂部與底部頂點
    ctx.moveTo(tail.x - tHalfW, tail.y);
    ctx.lineTo(head.x - hHalfW, head.y);
    ctx.lineTo(head.x + hHalfW, head.y);
    ctx.lineTo(head.x + hHalfW, head.y + head.height);
    ctx.lineTo(head.x - hHalfW, head.y + head.height);
    ctx.lineTo(tail.x - tHalfW, tail.y + tail.height);
    ctx.lineTo(tail.x + tHalfW, tail.y + tail.height);
    ctx.closePath();

    ctx.shadowColor = '#fe8019';
    ctx.shadowBlur = 8;
    ctx.fill();

    ctx.restore();
  }

  public destroy() {
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }
}
