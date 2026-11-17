// GLSL for the LUT atmosphere (after Hillaire 2020). Everything here works in kilometres.
// Media: gas (Rayleigh), dust (Henyey-Greenstein with per-channel g, two exponential
// layers: background + low "fog" layer) and an optional absorbing layer.
// LUTs hold radiance per unit solar irradiance; consumers multiply by the Sun.

export const ATMO_UNIFORMS = /* glsl */`
uniform float uRPlanet;      // datum radius
uniform float uRBottom;      // lowest radius the LUTs cover
uniform float uRTop;
uniform float uROcc;         // radius of the sphere that shadows the air (mean local terrain)
uniform vec3 uRayScat; uniform float uRayH;
uniform vec3 uMieScat; uniform vec3 uMieAbs; uniform float uMieH; uniform vec3 uMieG;
uniform vec4 uFog;           // x density multiplier, y base altitude, z scale height, w max density
uniform vec3 uAbsCoef; uniform vec2 uAbsLayer;   // absorber: centre altitude, half width
uniform vec3 uGroundAlbedo;
`;

export const ATMO_COMMON = /* glsl */`
#define PI 3.14159265359

struct Medium { vec3 scatR; vec3 scatM; vec3 ext; };

Medium sampleMedium(float h) {
  float dR = exp(-h / uRayH);
  float dM = exp(-h / uMieH) + min(uFog.w, uFog.x * exp(-(h - uFog.y) / uFog.z));
  float dA = max(0.0, 1.0 - abs(h - uAbsLayer.x) / uAbsLayer.y);
  Medium m;
  m.scatR = uRayScat * dR;
  m.scatM = uMieScat * dM;
  m.ext = m.scatR + m.scatM + uMieAbs * dM + uAbsCoef * dA;
  return m;
}

// Nearest positive hit distance of a ray with a sphere at the origin, or -1.
float raySphere(vec3 ro, vec3 rd, float R) {
  float b = dot(ro, rd), c = dot(ro, ro) - R * R;
  float disc = b * b - c;
  if (disc < 0.0) return -1.0;
  float s = sqrt(disc);
  float t0 = -b - s, t1 = -b + s;
  return t0 > 0.0 ? t0 : (t1 > 0.0 ? t1 : -1.0);
}

float phaseRayleigh(float c) { return 3.0 / (16.0 * PI) * (1.0 + c * c); }

vec3 phaseHG3(float c, vec3 g) {
  vec3 g2 = g * g;
  vec3 d = max(1.0 + g2 - 2.0 * g * c, vec3(1e-4));
  return (1.0 - g2) / (4.0 * PI * d * sqrt(d));
}

// Transmittance LUT parameterisation (Bruneton): u from the distance to the top, v from altitude.
vec2 transmittanceUv(float r, float mu) {
  r = clamp(r, uRBottom + 1e-3, uRTop - 1e-3);
  float H = sqrt(uRTop * uRTop - uRBottom * uRBottom);
  float rho = sqrt(max(r * r - uRBottom * uRBottom, 0.0));
  float d = -r * mu + sqrt(max(r * r * (mu * mu - 1.0) + uRTop * uRTop, 0.0));
  float dMin = uRTop - r, dMax = rho + H;
  return vec2((d - dMin) / (dMax - dMin), rho / H);
}

void transmittanceRMu(vec2 uv, out float r, out float mu) {
  float H = sqrt(uRTop * uRTop - uRBottom * uRBottom);
  float rho = H * uv.y;
  r = sqrt(rho * rho + uRBottom * uRBottom);
  float dMin = uRTop - r, dMax = rho + H;
  float d = dMin + uv.x * (dMax - dMin);
  mu = d == 0.0 ? 1.0 : clamp((H * H - rho * rho - d * d) / (2.0 * r * d), -1.0, 1.0);
}

// 1 when the Sun is above the occluder sphere's horizon as seen from radius r.
float planetShadow(float r, float muS) {
  float rr = max(r, uROcc + 1e-3);
  float cosH = -sqrt(max(1.0 - (uROcc / rr) * (uROcc / rr), 0.0));
  return smoothstep(cosH - 0.012, cosH + 0.012, muS);
}
`;

export const ATMO_LUT_ACCESS = /* glsl */`
uniform sampler2D tTransmittance;
uniform sampler2D tMultiScat;

vec3 transmittanceLut(float r, float mu) {
  vec2 uv = transmittanceUv(r, mu);
  return texture(tTransmittance, uv).rgb;
}

vec3 multiScatLut(float r, float muS) {
  vec2 uv = vec2(muS * 0.5 + 0.5, clamp((r - uRBottom) / (uRTop - uRBottom), 0.0, 1.0));
  uv = (uv * (vec2(MS_W, MS_H) - 1.0) + 0.5) / vec2(MS_W, MS_H);
  return texture(tMultiScat, uv).rgb;
}

// In-scattered light and transmittance along a ray, from ro for tMax km.
// Lsmooth = Rayleigh single scattering + all multiple scattering.
// Lmie    = dust single scattering WITHOUT its phase function (the view/Sun angle is
//           constant along a ray, so the consumer multiplies by the phase per pixel).
void integrateScattering(vec3 ro, vec3 rd, vec3 sunDir, float tMax, int steps, out vec3 Lsmooth, out vec3 Lmie, out vec3 trans) {
  float pr = phaseRayleigh(dot(rd, sunDir));
  trans = vec3(1.0); Lsmooth = vec3(0.0); Lmie = vec3(0.0);
  float n = float(steps);
  for (int i = 0; i < steps; i++) {
    // quadratic distribution: most samples near the camera, where the low dust layer is
    float a = float(i) / n, b = float(i + 1) / n;
    float t0 = tMax * a * a, t1 = tMax * b * b, dt = t1 - t0;
    vec3 p = ro + rd * (t0 + 0.4 * dt);
    float r = length(p);
    Medium m = sampleMedium(r - uRPlanet);
    float muS = dot(p, sunDir) / r;
    vec3 Tsun = transmittanceLut(r, muS) * planetShadow(r, muS);
    vec3 psi = multiScatLut(r, muS);
    vec3 stepT = exp(-m.ext * dt);
    vec3 k = (1.0 - stepT) / max(m.ext, vec3(1e-9));
    Lsmooth += trans * k * (m.scatR * pr * Tsun + psi * (m.scatR + m.scatM));
    Lmie += trans * k * (m.scatM * Tsun);
    trans *= stepT;
  }
}
`;

export const TRANSMITTANCE_FRAG = /* glsl */`
${ATMO_UNIFORMS}
${ATMO_COMMON}
in vec2 vUv;
out vec4 outColor;
void main() {
  float r, mu;
  transmittanceRMu(vUv, r, mu);
  vec3 ro = vec3(0.0, 0.0, r), rd = vec3(sqrt(max(1.0 - mu * mu, 0.0)), 0.0, mu);
  float tMax = raySphere(ro, rd, uRTop);
  vec3 od = vec3(0.0);
  const int N = 48;
  float dt = tMax / float(N);
  for (int i = 0; i < N; i++) {
    vec3 p = ro + rd * ((float(i) + 0.5) * dt);
    od += sampleMedium(length(p) - uRPlanet).ext * dt;
  }
  outColor = vec4(exp(-od), 1.0);
}`;

export const MULTISCAT_FRAG = /* glsl */`
${ATMO_UNIFORMS}
${ATMO_COMMON}
uniform sampler2D tTransmittance;
in vec2 vUv;
out vec4 outColor;
vec3 transmittanceLut(float r, float mu) { return texture(tTransmittance, transmittanceUv(r, mu)).rgb; }
void main() {
  vec2 uv = (vUv * vec2(MS_W, MS_H) - 0.5) / (vec2(MS_W, MS_H) - 1.0);
  float muS = clamp(uv.x * 2.0 - 1.0, -1.0, 1.0);
  float r = uRBottom + clamp(uv.y, 0.0, 1.0) * (uRTop - uRBottom);
  r = clamp(r, uRBottom + 0.01, uRTop - 0.01);
  vec3 ro = vec3(0.0, 0.0, r);
  vec3 sunDir = vec3(sqrt(max(1.0 - muS * muS, 0.0)), 0.0, muS);
  float rGround = min(uROcc, r - 0.02);
  vec3 L2 = vec3(0.0), fms = vec3(0.0);
  const int SQ = 8, STEPS = 20;
  for (int i = 0; i < SQ; i++) for (int j = 0; j < SQ; j++) {
    float u = (float(i) + 0.5) / float(SQ), v = (float(j) + 0.5) / float(SQ);
    float cosT = 1.0 - 2.0 * v, sinT = sqrt(max(1.0 - cosT * cosT, 0.0)), phi = 2.0 * PI * u;
    vec3 rd = vec3(sinT * cos(phi), sinT * sin(phi), cosT);
    float tTop = raySphere(ro, rd, uRTop), tG = raySphere(ro, rd, rGround);
    bool hit = tG > 0.0;
    float tMax = hit ? tG : tTop;
    vec3 trans = vec3(1.0), L = vec3(0.0), f = vec3(0.0);
    float dt = tMax / float(STEPS);
    for (int s = 0; s < STEPS; s++) {
      vec3 p = ro + rd * ((float(s) + 0.3) * dt);
      float pr = length(p);
      Medium m = sampleMedium(pr - uRPlanet);
      float mu = dot(p, sunDir) / pr;
      vec3 Tsun = transmittanceLut(pr, mu) * planetShadow(pr, mu);
      vec3 scat = m.scatR + m.scatM;
      vec3 stepT = exp(-m.ext * dt);
      vec3 k = (1.0 - stepT) / max(m.ext, vec3(1e-9));
      L += trans * k * scat * Tsun * (1.0 / (4.0 * PI));
      f += trans * k * scat;
      trans *= stepT;
    }
    if (hit) {
      vec3 p = ro + rd * tMax;
      float pr = length(p);
      float mu = dot(p, sunDir) / pr;
      L += trans * transmittanceLut(max(pr, uRBottom + 0.01), mu) * planetShadow(pr, mu) * max(mu, 0.0) * uGroundAlbedo / PI;
    }
    L2 += L; fms += f;
  }
  L2 /= float(SQ * SQ); fms /= float(SQ * SQ);
  outColor = vec4(L2 / (1.0 - min(fms, vec3(0.97))), 1.0);
}`;

// Sky-view LUT: u = azimuth from the Sun (0..180 deg, denser near the Sun),
// v = elevation (denser near the horizon). Two outputs: smooth, un-phased Mie.
export const SKYVIEW_FRAG = /* glsl */`
${ATMO_UNIFORMS}
${ATMO_COMMON}
${ATMO_LUT_ACCESS}
uniform float uCamR;       // camera radius (km)
uniform float uSunMu;      // cosine of the Sun's zenith angle at the camera
in vec2 vUv;
layout(location = 0) out vec4 outSmooth;
layout(location = 1) out vec4 outMie;
void main() {
  float r = clamp(uCamR, uRBottom + 0.01, uRTop - 0.01);
  float rG = uRBottom;        // view rays stop at the lowest terrain; real terrain covers the rest
  float beta = acos(clamp(sqrt(max(r * r - rG * rG, 0.0)) / r, -1.0, 1.0));
  float zenithHorizon = PI - beta;
  vec2 uv = clamp((vUv * vec2(SKY_W, SKY_H) - 0.5) / (vec2(SKY_W, SKY_H) - 1.0), 0.0, 1.0);
  float theta;
  if (uv.y < 0.5) { float c = 1.0 - 2.0 * uv.y; theta = zenithHorizon * (1.0 - c * c); }
  else { float c = uv.y * 2.0 - 1.0; theta = zenithHorizon + beta * c * c; }
  float cosPhi = 1.0 - 2.0 * uv.x * uv.x;
  float sinT = sin(theta);
  vec3 rd = vec3(sinT * cosPhi, sinT * sqrt(max(1.0 - cosPhi * cosPhi, 0.0)), cos(theta));
  vec3 sunDir = vec3(sqrt(max(1.0 - uSunMu * uSunMu, 0.0)), 0.0, uSunMu);
  vec3 ro = vec3(0.0, 0.0, r);
  float tTop = raySphere(ro, rd, uRTop), tG = raySphere(ro, rd, rG);
  float tMax = tG > 0.0 ? tG : tTop;
  vec3 Ls, Lm, T;
  integrateScattering(ro, rd, sunDir, tMax, 36, Ls, Lm, T);
  outSmooth = vec4(Ls, 1.0);
  outMie = vec4(Lm, 1.0);
}`;

// Shared by everything that reads the sky-view LUT.
export const SKYVIEW_ACCESS = /* glsl */`
uniform sampler2D tSkySmooth;
uniform sampler2D tSkyMie;
uniform vec4 uSkyParams;     // x zenith-horizon angle, y beta, zw unused
vec2 skyViewUv(float cosTheta, float cosPhi) {
  float theta = acos(clamp(cosTheta, -1.0, 1.0));
  float v;
  if (theta < uSkyParams.x) { float c = 1.0 - sqrt(max(1.0 - theta / uSkyParams.x, 0.0)); v = c * 0.5; }
  else { float c = sqrt(clamp((theta - uSkyParams.x) / uSkyParams.y, 0.0, 1.0)); v = c * 0.5 + 0.5; }
  float u = sqrt(clamp(0.5 - 0.5 * cosPhi, 0.0, 1.0));
  vec2 uv = vec2(u, v);
  return (uv * (vec2(SKY_W, SKY_H) - 1.0) + 0.5) / vec2(SKY_W, SKY_H);
}
// dirLocal: unit vector in the local sky frame (x toward the Sun's azimuth, z up).
vec3 skyRadianceLocal(vec3 d, vec3 sunLocal, vec3 mieG) {
  float lh = length(d.xy);
  float cosPhi = lh > 1e-5 ? d.x / lh : 1.0;
  vec2 uv = skyViewUv(d.z, cosPhi);
  return texture(tSkySmooth, uv).rgb + texture(tSkyMie, uv).rgb * phaseHG3(dot(d, sunLocal), mieG);
}
`;

// Aerial-perspective froxel atlas: FROX_D slices of FROX_W x FROX_H, ATLAS_X tiles per row.
export const FROXEL_FRAG = /* glsl */`
${ATMO_UNIFORMS}
${ATMO_COMMON}
${ATMO_LUT_ACCESS}
uniform vec3 uCamPosKm;      // planet-centred camera position
uniform vec3 uSunDirW;
uniform vec3 uCamRight, uCamUp, uCamFwd;
uniform vec2 uTanHalfFov;
uniform float uFroxelMax;    // km
layout(location = 0) out vec4 outSmooth;
layout(location = 1) out vec4 outMie;
layout(location = 2) out vec4 outTrans;
void main() {
  vec2 tile = floor(gl_FragCoord.xy / vec2(FROX_W, FROX_H));
  float slice = tile.y * float(ATLAS_X) + tile.x;
  vec2 uv = fract(gl_FragCoord.xy / vec2(FROX_W, FROX_H));
  vec2 ndc = uv * 2.0 - 1.0;
  vec3 rd = normalize(uCamFwd + uCamRight * ndc.x * uTanHalfFov.x + uCamUp * ndc.y * uTanHalfFov.y);
  float tMax = uFroxelMax * pow((slice + 1.0) / float(FROX_D), FROX_POW);
  float r = length(uCamPosKm);
  vec3 ro = uCamPosKm * (clamp(r, uRBottom + 0.01, uRTop - 0.01) / r);
  float tG = raySphere(ro, rd, uRBottom);
  if (tG > 0.0) tMax = min(tMax, tG);
  float tTop = raySphere(ro, rd, uRTop);
  if (tTop > 0.0) tMax = min(tMax, tTop);
  vec3 Ls, Lm, T;
  integrateScattering(ro, rd, uSunDirW, tMax, 6 + int(slice) / 2, Ls, Lm, T);
  outSmooth = vec4(Ls, 1.0);
  outMie = vec4(Lm, 1.0);
  outTrans = vec4(T, 1.0);
}`;

// Irradiance for surfaces: octahedral map of normals (rows 0..IRR-1) in the local sky
// frame, plus one extra row holding the circumsolar aureole as a directional term.
export const IRRADIANCE_FRAG = /* glsl */`
${ATMO_UNIFORMS}
${ATMO_COMMON}
uniform sampler2D tTransmittance;
${SKYVIEW_ACCESS}
uniform float uCamR;
uniform float uSunMu;
out vec4 outColor;
vec3 transmittanceLut(float r, float mu) { return texture(tTransmittance, transmittanceUv(r, mu)).rgb; }
vec3 octDecode(vec2 e) {
  e = e * 2.0 - 1.0;
  vec3 v = vec3(e, 1.0 - abs(e.x) - abs(e.y));
  float t = max(-v.z, 0.0);
  v.xy += vec2(v.x >= 0.0 ? -t : t, v.y >= 0.0 ? -t : t);
  return normalize(v);
}
// weight of the circumsolar window (1 at the Sun, 0 beyond ~28 degrees)
float circumsolar(float cosAngle) { return 1.0 - smoothstep(0.14, 0.49, acos(clamp(cosAngle, -1.0, 1.0))); }
void main() {
  vec3 sunLocal = vec3(sqrt(max(1.0 - uSunMu * uSunMu, 0.0)), 0.0, uSunMu);
  float r = clamp(uCamR, uRBottom + 0.01, uRTop - 0.01);
  const int N = 160;
  const float GOLDEN = 2.39996323;
  if (gl_FragCoord.y > float(IRR)) {
    // Row IRR: light from the aureole around the Sun, treated as coming from the Sun itself.
    vec3 t1 = normalize(cross(sunLocal, vec3(0.0, 1.0, 0.0))), t2 = cross(sunLocal, t1);
    float cosMax = cos(0.49);
    vec3 E = vec3(0.0);
    for (int i = 0; i < N; i++) {
      float c = 1.0 - (float(i) + 0.5) / float(N) * (1.0 - cosMax);
      float s = sqrt(max(1.0 - c * c, 0.0)), a = float(i) * GOLDEN;
      vec3 d = sunLocal * c + (t1 * cos(a) + t2 * sin(a)) * s;
      if (d.z < 0.0) continue;
      E += skyRadianceLocal(d, sunLocal, uMieG) * circumsolar(c);
    }
    outColor = vec4(E * (2.0 * PI * (1.0 - cosMax) / float(N)), 1.0);
    return;
  }
  vec2 uv = (gl_FragCoord.xy - 0.5) / (float(IRR) - 1.0);
  vec3 n = octDecode(clamp(uv, 0.0, 1.0));
  // Radiance of sunlit ground seen in the lower hemisphere (bounce light).
  vec3 skyUp = skyRadianceLocal(vec3(0.0, 0.0, 1.0), sunLocal, uMieG);
  vec3 skySide = skyRadianceLocal(normalize(vec3(-0.7, 0.0, 0.7)), sunLocal, uMieG);
  vec3 Eground = transmittanceLut(r, uSunMu) * max(uSunMu, 0.0) + PI * 0.5 * (skyUp + skySide);
  vec3 Lground = uGroundAlbedo / PI * Eground;
  vec3 E = vec3(0.0);
  for (int i = 0; i < N; i++) {
    float z = 1.0 - 2.0 * (float(i) + 0.5) / float(N);
    float s = sqrt(max(1.0 - z * z, 0.0)), a = float(i) * GOLDEN;
    vec3 d = vec3(cos(a) * s, sin(a) * s, z);
    float w = max(dot(n, d), 0.0);
    if (w <= 0.0) continue;
    vec3 L = d.z > 0.0 ? skyRadianceLocal(d, sunLocal, uMieG) * (1.0 - circumsolar(dot(d, sunLocal))) : Lground;
    E += L * w;
  }
  outColor = vec4(E * (4.0 * PI / float(N)), 1.0);
}`;
