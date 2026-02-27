/**
 * Gradient transform utilities for Figma plugin.
 * Computes the 2x3 affine transform matrix for gradient directions.
 *
 * Figma's gradient coordinate system: the gradient line goes from (0, 0.5) to (1, 0.5)
 * in gradient space. The transform maps this to the node's normalized space where
 * (0,0) is top-left and (1,1) is bottom-right.
 */

type GradientDirection = 'left-right' | 'right-left' | 'top-bottom' | 'bottom-top';

/**
 * Returns the Figma gradientTransform matrix for a given direction.
 * Default direction is 'top-bottom' (most common for design overlays).
 */
export function getGradientTransform(direction?: GradientDirection): Transform {
  switch (direction) {
    case 'left-right':
      // Identity: gradient flows left to right
      return [[1, 0, 0], [0, 1, 0]];

    case 'right-left':
      // 180° rotation around center
      return [[-1, 0, 1], [0, -1, 1]];

    case 'bottom-top':
      // 90° clockwise: gradient flows bottom to top
      return [[0, 1, 0], [-1, 0, 1]];

    case 'top-bottom':
    default:
      // 90° counter-clockwise: gradient flows top to bottom
      return [[0, -1, 1], [1, 0, 0]];
  }
}
