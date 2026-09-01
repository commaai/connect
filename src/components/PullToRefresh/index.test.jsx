import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PullToRefresh from '.';

const touch = (clientY, clientX = 0) => ({ clientX, clientY });

describe('PullToRefresh', () => {
  it('refreshes after a pull from the top reaches the threshold', async () => {
    const onRefresh = vi.fn();
    render(<PullToRefresh enabled threshold={50} onRefresh={onRefresh} />);

    fireEvent.touchStart(document, { touches: [touch(0)] });
    fireEvent.touchMove(document, { touches: [touch(120)] });
    await act(async () => {
      fireEvent.touchEnd(document);
      await Promise.resolve();
    });

    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('arms after a held scroll reaches the top and continues downward', async () => {
    const onRefresh = vi.fn();
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 100 });
    render(<PullToRefresh enabled threshold={50} onRefresh={onRefresh} />);

    fireEvent.touchStart(document, { touches: [touch(0)] });
    fireEvent.touchMove(document, { touches: [touch(40)] });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    fireEvent.touchMove(document, { touches: [touch(80)] });
    fireEvent.touchMove(document, { touches: [touch(200)] });
    await act(async () => {
      fireEvent.touchEnd(document);
      await Promise.resolve();
    });

    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('handles WebKit committing scrollY zero between touchmove events', async () => {
    const onRefresh = vi.fn();
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 100 });
    render(<PullToRefresh enabled threshold={50} onRefresh={onRefresh} />);

    fireEvent.touchStart(document, { touches: [touch(0)] });
    fireEvent.touchMove(document, { touches: [touch(80)] });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    fireEvent.scroll(window);
    fireEvent.touchMove(document, { touches: [touch(200)] });
    await act(async () => {
      fireEvent.touchEnd(document);
      await Promise.resolve();
    });

    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('does not arm when scrollY reaches zero after the touch ends', () => {
    const onRefresh = vi.fn();
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 100 });
    render(<PullToRefresh enabled threshold={50} onRefresh={onRefresh} />);

    fireEvent.touchStart(document, { touches: [touch(0)] });
    fireEvent.touchMove(document, { touches: [touch(80)] });
    fireEvent.touchEnd(document);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    fireEvent.scroll(window);
    fireEvent.touchMove(document, { touches: [touch(200)] });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('observes touchstart before a child stops propagation', async () => {
    const onRefresh = vi.fn();
    const { getByText } = render(
      <PullToRefresh enabled threshold={50} onRefresh={onRefresh}>
        <div onTouchStart={(event) => event.stopPropagation()}>Timeline</div>
      </PullToRefresh>,
    );

    fireEvent.touchStart(getByText('Timeline'), { touches: [touch(0)] });
    fireEvent.touchMove(getByText('Timeline'), { touches: [touch(120)] });
    await act(async () => {
      fireEvent.touchEnd(getByText('Timeline'));
      await Promise.resolve();
    });

    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('does not appear when a held scroll only arrives at the top', () => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 100 });
    const { container } = render(<PullToRefresh enabled><div>Content</div></PullToRefresh>);

    fireEvent.touchStart(document, { touches: [touch(0)] });
    fireEvent.touchMove(document, { touches: [touch(60)] });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    fireEvent.touchMove(document, { touches: [touch(100)] });
    fireEvent.touchEnd(document);

    expect(container.firstChild.lastChild.style.transform).toBe('none');
  });

  it('does not activate from momentum after the finger lifts', () => {
    const onRefresh = vi.fn();
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 100 });
    render(<PullToRefresh enabled threshold={50} onRefresh={onRefresh} />);

    fireEvent.touchStart(document, { touches: [touch(0)] });
    fireEvent.touchMove(document, { touches: [touch(40)] });
    fireEvent.touchEnd(document);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    fireEvent.touchMove(document, { touches: [touch(200)] });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('tracks a canceled pull smoothly until the actual release', () => {
    const onRefresh = vi.fn();
    const { container } = render(
      <PullToRefresh enabled threshold={100} onRefresh={onRefresh}><div>Content</div></PullToRefresh>,
    );
    const content = container.firstChild.lastChild;

    fireEvent.touchStart(document, { touches: [touch(100)] });
    fireEvent.touchMove(document, { touches: [touch(220)] });
    fireEvent.touchMove(document, { touches: [touch(100)] });

    expect(content.style.transform).toBe('none');
    expect(content.style.transition).toBe('none');

    fireEvent.touchEnd(document);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(content.style.transition).toContain('280ms');
  });

  it('grows a circular arc while pulling and spins it at the threshold', () => {
    const { container } = render(<PullToRefresh enabled threshold={50} />);

    fireEvent.touchStart(document, { touches: [touch(0)] });
    fireEvent.touchMove(document, { touches: [touch(50)] });
    const spinner = container.querySelector('svg');
    const animatedArc = spinner.querySelector('g');
    const partialArc = container.querySelector('circle').getAttribute('stroke-dasharray');
    expect(animatedArc.style.animation).toBe('none');

    fireEvent.touchMove(document, { touches: [touch(120)] });
    expect(container.querySelector('circle').getAttribute('stroke-dasharray')).not.toBe(partialArc);
    expect(spinner.style.transform).toBe('rotate(180deg)');
    expect(animatedArc.style.animation).toContain('linear');
  });

  it('keeps the spinner animation but disarms refresh below the threshold', async () => {
    const onRefresh = vi.fn();
    const { container } = render(<PullToRefresh enabled threshold={50} onRefresh={onRefresh} />);

    fireEvent.touchStart(document, { touches: [touch(0)] });
    fireEvent.touchMove(document, { touches: [touch(120)] });
    fireEvent.touchMove(document, { touches: [touch(60)] });

    expect(container.querySelector('g').style.animation).toContain('linear');

    await act(async () => {
      fireEvent.touchEnd(document);
      await Promise.resolve();
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('does not refresh below the threshold', () => {
    const onRefresh = vi.fn();
    render(<PullToRefresh enabled threshold={50} onRefresh={onRefresh} />);

    fireEvent.touchStart(document, { touches: [touch(0)] });
    fireEvent.touchMove(document, { touches: [touch(60)] });
    fireEvent.touchEnd(document);

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('ignores horizontal and multi-touch gestures', () => {
    const onRefresh = vi.fn();
    render(<PullToRefresh enabled threshold={50} onRefresh={onRefresh} />);

    fireEvent.touchStart(document, { touches: [touch(0)] });
    fireEvent.touchMove(document, { touches: [touch(20, 100)] });
    fireEvent.touchEnd(document);
    fireEvent.touchStart(document, { touches: [touch(0), touch(10)] });
    fireEvent.touchMove(document, { touches: [touch(200), touch(210)] });
    fireEvent.touchEnd(document);

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('does not install the gesture when disabled', () => {
    const onRefresh = vi.fn();
    render(<PullToRefresh enabled={false} onRefresh={onRefresh} />);

    fireEvent.touchStart(document, { touches: [touch(0)] });
    fireEvent.touchMove(document, { touches: [touch(200)] });
    fireEvent.touchEnd(document);

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('does not move or refresh the page while a modal holds the scroll lock', () => {
    const onRefresh = vi.fn();
    document.body.style.overflow = 'hidden';
    const { container } = render(
      <PullToRefresh enabled threshold={50} onRefresh={onRefresh}><div>Content</div></PullToRefresh>,
    );

    fireEvent.touchStart(document, { touches: [touch(0)] });
    fireEvent.touchMove(document, { touches: [touch(200)] });
    fireEvent.touchEnd(document);

    expect(container.firstChild.lastChild.style.transform).toBe('none');
    expect(onRefresh).not.toHaveBeenCalled();
    document.body.style.overflow = '';
  });
});
