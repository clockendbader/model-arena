// ============================================================================
// config.js — movement tuning. All units are metres / seconds.
// ============================================================================
export const C = {
  // body
  radius: 0.38, height: 1.8, crouchHeight: 0.95, eye: 1.64, crouchEye: 0.74,
  gravity: 25, termVel: 55, stepHeight: 0.36,

  // running
  runSpeed: 6.2, sprintSpeed: 9.2, flowMax: 3.3, crouchSpeed: 3.0, backMul: 0.62,
  accelLow: 30, accelHigh: 4.2, friction: 34,

  // jumping
  jumpVel: 8.4, jumpCut: 3.2, coyote: 0.12, jumpBuffer: 0.12, airAccel: 14,

  // wall-run / wall-climb
  wallrunTime: 1.5, wallrunGravity: 4.5, wallrunVy0: 3.2, wallrunMinSpeed: 5.5,
  wallKick: 6.0, wallJumpVy: 8.0,
  climbSpeed: 7.0, climbTime: 0.52, climbMinSpeed: 5.0,

  // ledge / vault
  ledgeMin: 0.6, ledgeMax: 2.25,
  vaultMin: 0.36, vaultMax: 1.3, vaultMinSpeed: 5.5, vaultMaxDepth: 2.0,

  // slide / roll
  slideMinSpeed: 5.0, slideBoost: 1.3, slideFriction: 3.4, slideMax: 16, slideEndSpeed: 2.8,
  hardLand: 15.5, lethalLand: 27, lethalRoll: 31, rollWindow: 0.32, rollTime: 0.62, stumbleTime: 0.6,

  // zipline
  zipMax: 19, zipGrab: 3.0, zipHang: 2.05,

  // simulation
  dt: 1 / 120,
};
