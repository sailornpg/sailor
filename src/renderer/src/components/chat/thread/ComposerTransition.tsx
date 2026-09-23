import { Component, type ReactNode, type RefObject } from 'react';

type Props = {
  phase: 'welcome' | 'transition' | 'chat';
  reduced: boolean;
  footer: RefObject<HTMLDivElement | null>;
  host: RefObject<HTMLDivElement | null>;
  children: ReactNode;
};

// Snapshot precedes welcome removal and composer clearing. The target is measured
// each frame because runtime scrolling and error/attachment rows can change it.
export class ComposerTransition extends Component<Props> {
  private frame = 0;

  getSnapshotBeforeUpdate(previous: Props): DOMRect | null {
    return previous.phase === 'welcome' && this.props.phase === 'transition'
      ? this.props.footer.current?.getBoundingClientRect() ?? null : null;
  }

  componentDidUpdate(_previous: Props, _state: unknown, snapshot: DOMRect | null) {
    if (this.props.reduced || this.props.phase !== 'transition') {
      this.cancel();
      return;
    }
    if (!snapshot) return;
    this.cancel();
    const start = performance.now();
    const step = (now: number) => {
      const footer = this.props.footer.current;
      if (!footer) return;
      const progress = Math.max(0, Math.min(1, (now - start - 80) / 570));
      const eased = 1 - (1 - progress) ** 4;
      // Read natural layout before applying the inverse transform, all before paint.
      footer.style.transform = '';
      footer.style.width = '';
      const target = footer.getBoundingClientRect();
      if (progress < 1) {
        footer.style.transform = 'translate(' + (snapshot.left - target.left) * (1 - eased) + 'px, ' + (snapshot.top - target.top) * (1 - eased) + 'px)';
        footer.style.width = snapshot.width + (target.width - snapshot.width) * eased + 'px';
        this.frame = requestAnimationFrame(step);
      }
    };
    step(start);
  }

  private cancel() {
    cancelAnimationFrame(this.frame);
    const footer = this.props.footer.current;
    if (footer) {footer.style.transform = '';footer.style.width = '';}
  }

  componentWillUnmount() { this.cancel(); }
  render() { return this.props.children; }
}
