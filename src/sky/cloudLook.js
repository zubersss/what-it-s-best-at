// The numbers of the clouds' look, in one place: the volume near the traveller (sky/cloudVolume.js)
// and the far shell (sky/clouds.js) give a heap the same two tones, so the hand-over at the
// volume's reach shows no step. No three, no DOM.
export const CLOUD_LOOK = Object.freeze({
  SUN_LOOK: 280,            // m toward the Sun: the look that splits a heap into its two tones
  SHADE: 0.42, LIT: 1.0,     // the two tones of a heap, with a clean line between them: the share of the Sun's light its shade side keeps ...
  SHADE_TINT: [0.8, 0.8, 1.12],   // ... and the lilac that light is turned to on the way through the cloud (the sky's own light is added to both)
  UNDER: 0.72,              // a heap's flat underside is this much darker again than its shade side
  CELL_SHADE: 0.64,         // a tower's own two tones (as they were: its slate comes from its depth)
  CELL_DENSE: 1.45,         // a cell is this much more solid than a heap
  CELL_FACE0: 250, CELL_FACE1: 700,   // m of chord between which a tower's own face turns from the Sun's tone to its shade
  CELL_LIT: 300,            // m of chord toward the Sun under which a tower's cloud is fully lit ...
  CELL_DEEP: 2600,          // ... and over which it is as dark as it gets
  CELL_FLOOR: 0.11,         // the light the base of a tower keeps (0.08..0.15 of the lit top)
  CELL_TINT: [0.62, 0.66, 1.0],   // the slate-indigo its shade is pulled toward
  CELL_SKY: 0.2,            // the share of the sky's light that reaches the heart of a tower
  CELL_BOIL: 5.5,           // m/s: its noise boils upward in the cell's own moving frame (3..8)
  CELL_LUMP: 0.5, CELL_LUMP_K: 0.9,   // a broader reading of the noise (this many times the noise's own scale) that moves the hull in bulges, and how much
  CELL_TURN: 0.5, CELL_TURN_LUMP: 1.4,   // how soft the turn from a tower's lit side to its shade is (in the cosine to the Sun), and how far the bulges move it
  CELL_NOISE: 0.55,         // the share of the cell's own noise that eats at its hull
  CELL_HAZE: 0.3,           // the share of the air's veil a tower far off keeps (40 km and farther; all of it within half the reach)
  ROUND: 0.18, ROUND_K: 0.22,   // the light that comes round into a cloud from its sides, and how deep it reaches
  FLOOR_DECK: 0.3,              // the least light a deck's base keeps (coloured shade, never black)
  GROUND_HALF: 0.5,         // under a storm the light from the ground below is halved
  MID_K: 1.2, HIGH_K: 0.35, // the Sun left by the layers above: exp(-MID_K mid - HIGH_K high)
  SHAFT_K: 0.00014, SHAFT_P: 0.85,   // the rain's optical depth a metre: K rate^P
  SHAFT_FALL: 9,            // m/s a drop falls (its foot is offset downwind by this)
  SHAFT_NEAR: 600,          // m: nearer than this the shafts fade out (D's streaks take over)
  SHAFT_MIST: 300,          // m over the country that a shaft's foot turns to mist
  SHAFT_GREY: 0.7,          // the share of the sky's light a shaft shows
  SHAFT_GLOW: 1.1,          // the silver glow with a low Sun behind it
  VIRGA: 2000,              // m: light rain under a base this far over the ground fades out
});
