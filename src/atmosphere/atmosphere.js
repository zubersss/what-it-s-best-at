// Atmosphere LUT manager (Hillaire 2020 style). Publishes its textures and parameters in
// the shared uniform map G so every lit material can use them.
//
// `world.atmosphere === null` is not a special case: it becomes an empty medium (all
// coefficients zero), the same passes run once, and the sky simply stays black.
// The uniform objects are created once and only their values change when the world
// changes (`setWorld`), so materials built earlier keep working after a world switch.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { G } from '../render/globals.js';
import { makePassMaterial, renderPass } from '../render/fullscreen.js';
import { TRANSMITTANCE_FRAG, MULTISCAT_FRAG, SKYVIEW_FRAG, FROXEL_FRAG, IRRADIANCE_FRAG, SKYE_FRAG, SKYGAIN_FRAG } from './atmosphereGlsl.js';

const KM = 0.001;
export const FROXEL_POW = 2.5;
const SKYE_W = 64;          // texels of the sky-light-versus-Sun-height table
const AIR_N = 64;           // cells across the terrain-shadow-in-air map

function fl(n) { return Number.isInteger(n) ? n.toFixed(1) : String(n); }

export function atmosphereDefines() {
  const [sw, sh] = CONFIG.SKYVIEW, [mw, mh] = CONFIG.MULTISCATTER, [fw, fh, fd] = CONFIG.FROXEL, [ax, ay] = CONFIG.FROXEL_ATLAS;
  return {
    SKY_W: fl(sw), SKY_H: fl(sh), MS_W: fl(mw), MS_H: fl(mh), MS_SCALE: '10000.0',
    FROX_W: fl(fw), FROX_H: fl(fh), FROX_D: fd, ATLAS_X: ax, ATLAS_Y: ay, FROX_POW: fl(FROXEL_POW), IRR: CONFIG.IRRADIANCE,
    SKYE_W: SKYE_W, SKYE_SCALE: '1000.0',
  };
}

export class Atmosphere {
  constructor(renderer, world) {
    this.renderer = renderer;
    const u = {
      uRPlanet: { value: 1 }, uRBottom: { value: 1 }, uRTop: { value: 2 }, uROcc: { value: 1 },
      uRayScat: { value: new THREE.Vector3() }, uRayH: { value: 8 },
      uMieScat: { value: new THREE.Vector3() }, uMieAbs: { value: new THREE.Vector3() }, uMieH: { value: 8 },
      uMieG: { value: new THREE.Vector3() },
      uFog: { value: new THREE.Vector4(0, 0, 1, 8) },
      uAbsCoef: { value: new THREE.Vector3() }, uAbsLayer: { value: new THREE.Vector2(25, 15) },
      uGroundAlbedo: { value: new THREE.Vector3() },
    };
    this.params = u;
    const defines = atmosphereDefines();
    const half = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping };
    const [tw, th] = CONFIG.TRANSMITTANCE, [mw, mh] = CONFIG.MULTISCATTER, [sw, sh] = CONFIG.SKYVIEW, [fw, fh] = CONFIG.FROXEL, [ax, ay] = CONFIG.FROXEL_ATLAS;
    const I = CONFIG.IRRADIANCE;
    this.transmittance = new THREE.WebGLRenderTarget(tw, th, half);
    this.multiScat = new THREE.WebGLRenderTarget(mw, mh, half);
    this.skyView = new THREE.WebGLRenderTarget(sw, sh, { ...half, count: 2 });
    this.froxels = new THREE.WebGLRenderTarget(fw * ax, fh * ay, { ...half, count: 3 });
    this.irradiance = new THREE.WebGLRenderTarget(I, I + 1, half);
    this.skyE = new THREE.WebGLRenderTarget(SKYE_W, 1, half);
    this.skyGain = new THREE.WebGLRenderTarget(SKYE_W, 1, half);
    this.gpuBytes = 8 * (tw * th + mw * mh + 2 * sw * sh + 3 * fw * ax * fh * ay + I * (I + 1) + 2 * SKYE_W) + 2 * AIR_N * AIR_N;

    const lut = { tTransmittance: { value: this.transmittance.texture }, tMultiScat: { value: this.multiScat.texture } };
    const sky = { tSkySmooth: { value: this.skyView.textures[0] }, tSkyMie: { value: this.skyView.textures[1] }, uSkyParams: { value: new THREE.Vector4(Math.PI / 2, 0.01, 1, 0) } };
    this.cam = { uCamR: { value: 1 }, uSunMu: { value: 0 }, uLutScale: { value: 1 } };
    this.transMat = makePassMaterial(TRANSMITTANCE_FRAG, { ...u }, { defines });
    this.msMat = makePassMaterial(MULTISCAT_FRAG, { ...u, tTransmittance: lut.tTransmittance }, { defines });
    this.skyMat = makePassMaterial(SKYVIEW_FRAG, { ...u, ...lut, ...this.cam }, { defines });
    this.froxelU = {
      uCamPosKm: { value: new THREE.Vector3() }, uSunDirW: G.uSunDir, uCamRight: G.uCamRight, uCamUp: G.uCamUp, uCamFwd: G.uCamFwd, uTanHalfFov: G.uTanHalfFov,
      uFroxelRange: { value: new THREE.Vector2(0, 400) }, uLutScale: { value: 1 },
    };
    // Terrain shadow in the air (see updateAir): a small map filled by a terrain worker.
    this.airTex = new THREE.DataTexture(new Uint16Array(AIR_N * AIR_N), AIR_N, AIR_N, THREE.RedFormat, THREE.HalfFloatType);
    this.airTex.minFilter = this.airTex.magFilter = THREE.LinearFilter;
    this.airTex.wrapS = this.airTex.wrapT = THREE.ClampToEdgeWrapping;
    this.airTex.needsUpdate = true;
    this.airU = {
      tAirShadow: { value: this.airTex }, uAirOrigin: { value: new THREE.Vector3() },
      uAirE: { value: new THREE.Vector3(1, 0, 0) }, uAirN: { value: new THREE.Vector3(0, 1, 0) }, uAirParams: { value: new THREE.Vector3(1, 0.4, 0) },
    };
    this.airEnabled = true;              // governor switch
    this.air = null;                     // what the current map was made for
    this.airPending = false;
    this.froxelMat = makePassMaterial(FROXEL_FRAG, { ...u, ...lut, ...this.froxelU, ...this.airU }, { defines });
    this.irrMat = makePassMaterial(IRRADIANCE_FRAG, { ...u, tTransmittance: lut.tTransmittance, ...sky, ...this.cam }, { defines });
    this.skyEMat = makePassMaterial(SKYE_FRAG, { ...u, ...lut }, { defines });
    this.skyGainMat = makePassMaterial(SKYGAIN_FRAG, { tSkyE: { value: this.skyE.texture }, uSunMu: this.cam.uSunMu }, { defines });

    // Publish for consumers (terrain, rocks, ship, hero, sky dome, sun, bodies).
    Object.assign(G, u, {
      tTransmittance: lut.tTransmittance, tMultiScat: lut.tMultiScat, ...sky,
      tSkyGain: { value: this.skyGain.texture },        // sky light elsewhere on the globe relative to here
      tIrradiance: { value: this.irradiance.texture },
      tFroxelA: { value: this.froxels.textures[0] }, tFroxelB: { value: this.froxels.textures[1] }, tFroxelC: { value: this.froxels.textures[2] },
      uFroxelRange: this.froxelU.uFroxelRange,          // x = slice distribution exponent, y = far limit (km)
      uLutScaleInv: { value: new THREE.Vector2(1, 1) },
      uSkyFrame: { value: new THREE.Matrix3() },
      uSunLocal: { value: new THREE.Vector3(0, 0, 1) },
      uSkyFade: { value: 1 },                           // 1: sky from the sky-view LUT (camera in the air); 0: marched per pixel (camera in space)
    });
    this._up = new THREE.Vector3(); this._sh = new THREE.Vector3(); this._third = new THREE.Vector3();
    this.setWorld(world);
  }

  // Loads a world's medium into the existing uniforms and marks every LUT stale.
  setWorld(world) {
    const a = world.atmosphere, u = this.params;
    this.empty = !a;
    const R = world.radius * KM;
    const set3 = (v, x) => { const s = x || [0, 0, 0]; v.set(s[0] / KM, s[1] / KM, s[2] / KM); };   // per metre -> per km
    const dust = a?.dust, fog = dust?.fog, abs = a?.absorber;
    this.rPlanet = R;
    this.rBottom = R + (world.terrain.minAltitude - 300) * KM;
    this.rTop = R + (a?.topAltitude ?? 60000) * KM;
    this.rOcc = R + (a?.occluderAltitude ?? 0) * KM;
    u.uRPlanet.value = R; u.uRBottom.value = this.rBottom; u.uRTop.value = this.rTop; u.uROcc.value = this.rOcc;
    set3(u.uRayScat.value, a?.rayleigh?.scattering); u.uRayH.value = (a?.rayleigh?.scaleHeight ?? 8000) * KM;
    set3(u.uMieScat.value, dust?.scattering); set3(u.uMieAbs.value, dust?.absorption); u.uMieH.value = (dust?.scaleHeight ?? 8000) * KM;
    u.uMieG.value.set(...(dust?.phaseG || [0, 0, 0]));
    u.uFog.value.set(fog?.density ?? 0, (fog?.baseAltitude ?? 0) * KM, (fog?.scaleHeight ?? 1000) * KM, fog?.maxDensity ?? 8);
    set3(u.uAbsCoef.value, abs?.absorption); u.uAbsLayer.value.set((abs?.centerAltitude ?? 25000) * KM, (abs?.halfWidth ?? 15000) * KM);
    u.uGroundAlbedo.value.set(...(world.surface.meanAlbedo || world.surface.dust));
    this.staticDone = false; this.froxelDone = false;
    this.lastMu = 99; this.lastR = -1; this.skyScale = 0;
    this.air = null; this.airU.uAirParams.value.z = 0;
    this.shadowReach = world.terrain.shadowRange ?? 150000;
  }

  // True while a terrain-shadow map is wanted but not there yet (screenshots wait for it).
  get airBusy() { return this.airWanted && (this.airPending || !this.air); }

  // Keeps the terrain-shadow-in-air map around the camera up to date. A terrain worker
  // fills it (about 80 k coarse height samples); it is redone when the camera has moved a
  // sixth of the map's half-width, when the Sun has moved 0.4 degrees, or when the map
  // should be a different size (it grows with altitude). terrain: for its workers and epoch.
  updateAir(camPos, sunDir, terrain) {
    const up = this._up.copy(camPos).normalize(), alt = camPos.length() - this.rPlanet / KM;
    // No air, switched off, in space, or night at the camera (the planet's own shadow
    // already takes the sunlight away): no map.
    this.airWanted = !this.empty && this.airEnabled && alt < 150000 && up.dot(sunDir) > -0.1;
    if (!this.airWanted) { this.airU.uAirParams.value.z = 0; this.air = null; return; }
    const extent = Math.min(300000, Math.max(this.shadowReach * 0.6, 4 * alt));
    const a = this.air;
    const stale = !a || a.center.distanceToSquared(up) * this.rPlanet * this.rPlanet / (KM * KM) > (a.extent / 6) ** 2 ||
      a.sun.dot(sunDir) < 0.999976 || Math.abs(extent / a.extent - 1) > 0.3;
    if (!stale || this.airPending) return;
    const east = new THREE.Vector3(-up.y, up.x, 0);
    if (east.lengthSq() < 1e-12) east.set(1, 0, 0);
    east.normalize();
    const north = new THREE.Vector3().crossVectors(up, east), center = up.clone(), sun = sunDir.clone(), epoch = terrain.epoch;
    const job = terrain.workers.run({ type: 'air', center: center.toArray(), east: east.toArray(), north: north.toArray(), extent, n: AIR_N, sun: sun.toArray() });
    if (!job) return;                       // every worker is busy: try again next frame
    this.airPending = true;
    job.then((res) => {
      this.airPending = false;
      if (epoch !== terrain.epoch || this.empty) return;
      if (this.airDebugAll) res.map.fill(0x4f80);        // ?debug=airall: pretend all air is in shadow (60 km as a half float)
      this.airTex.image.data = res.map; this.airTex.needsUpdate = true;
      this.airU.uAirOrigin.value.copy(center).multiplyScalar(this.rPlanet);
      this.airU.uAirE.value.copy(east); this.airU.uAirN.value.copy(north);
      this.airU.uAirParams.value.set(1 / (2 * extent * KM), Math.max(0.3, 2 * extent * KM / AIR_N * 0.12), 1);
      this.air = { center, sun, extent };
    }).catch(() => { this.airPending = false; });
  }

  // camPos: planet-centred metres (doubles). sunDir: unit, planet-fixed. farDistance: metres.
  update(camPos, sunDir, farDistance, exposure) {
    const scale = Math.min(1e7, Math.max(1e-2, exposure));
    const r = this.renderer;
    if (!this.staticDone) {
      renderPass(r, this.transMat, this.transmittance);
      renderPass(r, this.msMat, this.multiScat);
      renderPass(r, this.skyEMat, this.skyE);
      this.staticDone = true;
    }
    const up = this._up.copy(camPos).normalize();
    const camKm = camPos.length() * KM;
    const camR = Math.min(this.rTop - 0.02, Math.max(this.rBottom + 0.02, camKm));
    const mu = up.dot(sunDir);
    // The sky-view LUT is built for a camera inside the air. From space the sky dome
    // marches each view ray through the shell instead (the glow on the planet's edge is
    // far thinner than the LUT could resolve). The two are the same physics; they are
    // cross-faded over the top tenth of the atmosphere, where the air is thinnest.
    this.outside = camKm > this.rTop;
    G.uSkyFade.value = Math.min(1, Math.max(0, (this.rTop - camKm) / (0.1 * (this.rTop - this.rPlanet))));

    // Local sky frame: x toward the Sun's azimuth, z up.
    const sh = this._sh.copy(sunDir).addScaledVector(up, -mu);
    if (sh.lengthSq() < 1e-10) sh.set(up.y, -up.x, 0).addScaledVector(up, -(up.y * up.x - up.x * up.y));
    sh.normalize();
    const third = this._third.crossVectors(up, sh);
    G.uSkyFrame.value.set(sh.x, sh.y, sh.z, third.x, third.y, third.z, up.x, up.y, up.z);
    G.uSunLocal.value.set(Math.sqrt(Math.max(0, 1 - mu * mu)), 0, mu);

    const drift = Math.abs(Math.log2(scale / (this.skyScale || 1e-9)));
    if (Math.abs(mu - this.lastMu) > 1.5e-4 || Math.abs(camR - this.lastR) > 0.004 || drift > 5) {
      this.lastMu = mu; this.lastR = camR; this.skyScale = scale;
      this.cam.uLutScale.value = scale; G.uLutScaleInv.value.x = 1 / scale;
      this.cam.uCamR.value = camR; this.cam.uSunMu.value = mu;
      const rG = this.rBottom;
      const beta = Math.acos(Math.min(1, Math.sqrt(Math.max(0, camR * camR - rG * rG)) / camR));
      G.uSkyParams.value.set(Math.PI - beta, Math.max(beta, 1e-4), 1 / scale, 0);
      renderPass(r, this.skyMat, this.skyView);
      renderPass(r, this.irrMat, this.irradiance);
      renderPass(r, this.skyGainMat, this.skyGain);
    }

    // Aerial perspective froxels follow the camera every frame (one draw call). From
    // space the slices start where the view first meets the atmosphere.
    if (!this.empty || !this.froxelDone) {
      this.froxelU.uCamPosKm.value.copy(camPos).multiplyScalar(KM);
      // Inside the air most haze is near the camera (dense slices first); from space it
      // is at the far end of each ray, so the slices are spread evenly.
      this.froxelU.uFroxelRange.value.set(this.outside ? 1.0 : FROXEL_POW, Math.max(20, farDistance * KM));
      this.froxelU.uLutScale.value = scale; G.uLutScaleInv.value.y = 1 / scale;
      renderPass(r, this.froxelMat, this.froxels);
      this.froxelDone = true;
    }
  }
}
