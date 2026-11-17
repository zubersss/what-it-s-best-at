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
import { TRANSMITTANCE_FRAG, MULTISCAT_FRAG, SKYVIEW_FRAG, FROXEL_FRAG, IRRADIANCE_FRAG } from './atmosphereGlsl.js';

const KM = 0.001;
export const FROXEL_POW = 2.5;

function fl(n) { return Number.isInteger(n) ? n.toFixed(1) : String(n); }

export function atmosphereDefines() {
  const [sw, sh] = CONFIG.SKYVIEW, [mw, mh] = CONFIG.MULTISCATTER, [fw, fh, fd] = CONFIG.FROXEL, [ax, ay] = CONFIG.FROXEL_ATLAS;
  return {
    SKY_W: fl(sw), SKY_H: fl(sh), MS_W: fl(mw), MS_H: fl(mh), MS_SCALE: '10000.0',
    FROX_W: fl(fw), FROX_H: fl(fh), FROX_D: fd, ATLAS_X: ax, ATLAS_Y: ay, FROX_POW: fl(FROXEL_POW), IRR: CONFIG.IRRADIANCE,
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
    this.gpuBytes = 8 * (tw * th + mw * mh + 2 * sw * sh + 3 * fw * ax * fh * ay + I * (I + 1));

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
    this.froxelMat = makePassMaterial(FROXEL_FRAG, { ...u, ...lut, ...this.froxelU }, { defines });
    this.irrMat = makePassMaterial(IRRADIANCE_FRAG, { ...u, tTransmittance: lut.tTransmittance, ...sky, ...this.cam }, { defines });

    // Publish for consumers (terrain, rocks, ship, hero, sky dome, sun, bodies).
    Object.assign(G, u, {
      tTransmittance: lut.tTransmittance, ...sky,
      tIrradiance: { value: this.irradiance.texture },
      tFroxelA: { value: this.froxels.textures[0] }, tFroxelB: { value: this.froxels.textures[1] }, tFroxelC: { value: this.froxels.textures[2] },
      uFroxelRange: this.froxelU.uFroxelRange,          // x = slice distribution exponent, y = far limit (km)
      uLutScaleInv: { value: new THREE.Vector2(1, 1) },
      uSkyFrame: { value: new THREE.Matrix3() },
      uSunLocal: { value: new THREE.Vector3(0, 0, 1) },
      uSkyFade: { value: 1 },                           // sky in-scatter fades out when the camera leaves the atmosphere
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
  }

  // camPos: planet-centred metres (doubles). sunDir: unit, planet-fixed. farDistance: metres.
  update(camPos, sunDir, farDistance, exposure) {
    const scale = Math.min(1e7, Math.max(1e-2, exposure));
    const r = this.renderer;
    if (!this.staticDone) {
      renderPass(r, this.transMat, this.transmittance);
      renderPass(r, this.msMat, this.multiScat);
      this.staticDone = true;
    }
    const up = this._up.copy(camPos).normalize();
    const camKm = camPos.length() * KM;
    const camR = Math.min(this.rTop - 0.02, Math.max(this.rBottom + 0.02, camKm));
    const mu = up.dot(sunDir);
    // Above the atmosphere the sky-view LUT (built for a camera inside it) is no longer
    // valid; its contribution fades out over two atmosphere thicknesses.
    this.outside = camKm > this.rTop;
    G.uSkyFade.value = this.empty ? 0 : Math.min(1, Math.max(0, 1 - (camKm - this.rTop) / (2 * (this.rTop - this.rPlanet))));

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
