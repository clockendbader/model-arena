// ---------------------------------------------------------------------------
// Tuning constants. Everything that affects game feel lives here.
// ---------------------------------------------------------------------------

export const PHYS = {
  fixedDt: 1 / 120,
  maxSubMove: 0.14,       // metres per collision sub-step
  gravity: 24,
  radius: 0.34,
  standHeight: 1.8,
  crouchHeight: 0.9,
  eyeStand: 1.66,
  eyeCrouch: 0.78,
  stepUp: 0.42,           // stairs / curbs you walk up without jumping
  airStepUp: 0.22,        // forgiving edge-catch while falling
  groundSnap: 0.32,
};

export const MOVE = {
  walkSpeed: 6.4,
  sprintSpeed: 9.6,       // reached quickly
  topSpeed: 11.8,         // reached by sustained sprinting / good moves
  crouchSpeed: 3.0,
  accelLow: 32,           // below walkSpeed
  accelHigh: 6.5,         // walk -> sprint
  accelTop: 1.35,         // sprint -> top
  groundFriction: 26,
  turnRate: 10,           // rad/s velocity re-direction on ground
  airAccel: 9,
  airTurnRate: 1.6,

  jumpVel: 6.1,
  jumpHoldTime: 0.2,
  jumpHoldGravity: 0.5,
  jumpCutGravity: 1.9,
  coyoteTime: 0.12,
  jumpBuffer: 0.12,

  // wall-run
  wallRunMinSpeed: 5.2,
  wallRunTime: 1.5,
  wallRunStartUp: 2.6,   // clamp range [2.0, 3.0] on attach
  wallRunKickOut: 5.6,
  wallRunKickUp: 6.4,
  wallRunReach: 0.62,

  // wall-climb
  climbVel: 6.6,
  climbGravity: 12,
  climbTime: 0.72,
  climbReach: 0.75,

  // ledge / mantle
  ledgeReachMax: 2.15,
  ledgeReachMin: 0.45,

  // vault
  vaultMinSpeed: 4.6,
  vaultMinH: 0.4,
  vaultMaxH: 1.3,
  vaultMaxDepth: 1.7,

  // slide / roll
  slideMinSpeed: 4.8,
  slideFriction: 2.6,
  slideSlopeAccel: 0.95,
  slideBoost: 1.0,
  rollWindow: 0.45,
  rollTime: 0.62,

  hardLandVel: 12.5,
  fatalLandVel: 21.5,
  stumbleTime: 0.65,

  wallImpactLoss: 4.5,

  zipMaxSpeed: 19,
  zipGrabDist: 1.9,
  zipHang: 2.12,
};

export const CAM = {
  fovBase: 75,
  fovMax: 95,
  fovSpeedMin: 6.5,
  fovSpeedMax: 13.5,
  bobAmp: 0.045,
  wallTilt: 0.2,
  defaultSens: 1.0,
};

export const STORAGE_KEY = 'highline.v1';
