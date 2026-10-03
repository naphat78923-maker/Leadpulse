import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import LayaSpark, { SPARK_PATH, TICK_PATH } from './LayaSpark';

const spark = (container: HTMLElement) => container.querySelector('[data-spark]')!;

describe('LayaSpark', () => {
  afterEach(cleanup);

  it('breathes only while working', () => {
    const { container, rerender } = render(<LayaSpark state="working" />);
    expect(spark(container).getAttribute('class')).toMatch(/laya-spark-working/);
    rerender(<LayaSpark state="idle" />);
    expect(spark(container).getAttribute('class')).not.toMatch(/laya-spark-working/);
  });

  it('morphs into a tick only when work actually finishes', () => {
    const { container, rerender } = render(<LayaSpark state="working" />);
    rerender(<LayaSpark state="ok" />);
    expect(spark(container).getAttribute('data-morph')).toBe('true');
  });

  it('stays a plain spark when it starts out ok, or goes idle to ok', () => {
    const { container, rerender } = render(<LayaSpark state="ok" />);
    expect(spark(container).getAttribute('data-morph')).toBeNull();
    rerender(<LayaSpark state="idle" />);
    rerender(<LayaSpark state="ok" />);
    expect(spark(container).getAttribute('data-morph')).toBeNull();
  });

  it('draws both shapes with the same number of points, so one can become the other', () => {
    const points = (d: string) => d.match(/[ML]/g)!.length;
    expect(points(SPARK_PATH)).toBe(points(TICK_PATH));
  });
});
