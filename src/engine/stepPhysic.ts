import { quat, vec3 } from "gl-matrix";
import { getQuat, getVec3, positions, rotations, setQuat } from "./buffers";
import { ITEM_RADIUS, nPhysic, SIZE_PHYSIC } from "./constants";

//
// tmp vars
//
const q = quat.create();
const rot = quat.create();
const vRot = quat.create();

const p = vec3.create();
const u = vec3.create();
const v = vec3.create();

const QUAT_ID = quat.identity(quat.create());

const velocities = new Float32Array(nPhysic * 3);
const velocitiesRot = new Float32Array(nPhysic * 4);
quat.identity(q);
for (let i = nPhysic; i--; ) setQuat(velocitiesRot, i, q);
for (let i = nPhysic; i--; ) {
  quat.identity(q);
  quat.rotateX(q, q, Math.random() * 0.1);
  quat.rotateY(q, q, Math.random() * 0.1);
  setQuat(velocitiesRot, i, q);
}

const acceleration = new Float32Array(nPhysic * 3);

let tideX = 0;

export const collision_planes = [
  //
  {
    n: vec3.set(vec3.create(), 0, 0, 1),
    d: 0,
    p: vec3.set(vec3.create(), 0, 0, -SIZE_PHYSIC),
  },
  {
    n: vec3.set(vec3.create(), 0, 0, -1),
    d: 0,
    p: vec3.set(vec3.create(), 0, 0, SIZE_PHYSIC),
  },
  {
    n: vec3.set(vec3.create(), -1, 0, 0),
    d: 0,
    p: vec3.set(vec3.create(), SIZE_PHYSIC, 0, 0),
  },
  {
    n: vec3.set(vec3.create(), 1, 0, 0),
    d: 0,
    p: vec3.set(vec3.create(), -SIZE_PHYSIC, 0, 0),
  },
];
for (const plane of collision_planes) {
  plane.d = -vec3.dot(plane.n, plane.p);
}

const gridResolution = 1.2;
const gridOffsetX = -(SIZE_PHYSIC + 1);
const gridOffsetY = -(SIZE_PHYSIC + 1);
const gridOverlap = 0.6;
const gridN = Math.floor((SIZE_PHYSIC * 2) / gridResolution) + 2;
const grid = Array.from({ length: gridN ** 2 }, () => new Set<number>());

const getCellIndex = (cellX: number, cellY: number) => cellX * gridN + cellY;
const getCells = (out: number[], x: number, y: number) => {
  const cX = Math.floor((x - gridOffsetX) / gridResolution);
  const cY = Math.floor((y - gridOffsetY) / gridResolution);

  if (cX < 0 || cX >= gridN || cY < 0 || cY >= gridN) {
    out.length = 0;
    return;
  }

  out.length = 1;
  out[0] = getCellIndex(cX, cY);

  const xm = 1 - (x - cX * gridResolution) > gridOverlap && cX + 1 < gridN;
  const ym = 1 - (y - cY * gridResolution) > gridOverlap && cY + 1 < gridN;

  if (xm) out.push(getCellIndex(cX + 1, cY));
  if (ym) {
    out.push(getCellIndex(cX, cY + 1));
    if (xm) out.push(getCellIndex(cX + 1, cY + 1));
  }
};

const cells1: number[] = [];
const cells2: number[] = [];
const seen = new Set<number>();

// init
for (let i = 0; i < nPhysic; i++) {
  getCells(cells1, positions[i * 3 + 0], positions[i * 3 + 2]);
  for (let k = cells1.length; k--; ) grid[cells1[k]].add(i);
}

const applyForce = (i: number, fv: vec3, s: number) => {
  acceleration[i * 3 + 0] += fv[0] * s;
  acceleration[i * 3 + 1] += fv[1] * s;
  acceleration[i * 3 + 2] += fv[2] * s;
};

export const stepPhysic = (dt: number) => {
  acceleration.fill(0);

  tideX =
    ((tideX + dt * 5 + SIZE_PHYSIC * 1.6) % (SIZE_PHYSIC * 2 * 1.6)) -
    SIZE_PHYSIC * 1.6;

  for (let i = 0; i < nPhysic; i++) {
    getVec3(p, positions, i);

    // solid friction
    acceleration[i * 3 + 0] += (-velocities[i * 3 + 0] * 0.03) / dt;
    acceleration[i * 3 + 1] += (-velocities[i * 3 + 1] * 0.03) / dt;
    acceleration[i * 3 + 2] += (-velocities[i * 3 + 2] * 0.03) / dt;

    // rotation velocity reduction
    getQuat(vRot, velocitiesRot, i);
    quat.slerp(vRot, vRot, QUAT_ID, 0.006);
    setQuat(velocitiesRot, i, vRot);

    // gravity
    acceleration[i * 3 + 1] -= 6;

    // underwater
    if (p[1] < 0) {
      // buoyance
      acceleration[i * 3 + 1] += -p[1] * 30;

      // low tide
      const m = 4;
      const d = Math.min(m, Math.abs(tideX - p[0]));
      const f = ((d - m) / m) ** 2;

      acceleration[i * 3 + 1] -= f * 20;
    }

    // wall
    for (let k = collision_planes.length; k--; ) {
      const plane = collision_planes[k];

      const d = vec3.dot(p, plane.n) + plane.d - ITEM_RADIUS;

      if (d < 0) {
        const m = 0.16;
        const f = 20 * (Math.min(-d, m) / m) ** 2;

        applyForce(i, plane.n, f);
      }
    }

    // push each other

    // query the grid to get the closest entities

    seen.clear();
    getCells(cells1, p[0], p[2]);
    for (let k = cells1.length; k--; )
      for (const j of grid[cells1[k]] as any)
        if (j < i && !seen.has(j)) {
          getVec3(u, positions, j);

          seen.add(j);

          const dSquare = vec3.sqrDist(p, u);

          if (dSquare < (ITEM_RADIUS * 2) ** 2) {
            const d = Math.sqrt(dSquare);

            if (d > 0.0001) {
              vec3.sub(v, p, u);
              vec3.scale(v, v, 1 / d);
            } else {
              vec3.set(v, 0, 1, 0);
            }

            const f = 60 * Math.min(0.25, 1 / (1 - d / (ITEM_RADIUS * 2)));

            applyForce(i, v, f);
            applyForce(j, v, -f);

            // push up
            if (p[1] > u[1]) acceleration[i * 3 + 1] += 0.7 * f;
            else acceleration[j * 3 + 1] += 0.7 * f;
          }
        }
  }

  for (let i = nPhysic; i--; ) {
    // save the previous cells
    getCells(cells1, positions[i * 3 + 0], positions[i * 3 + 2]);

    // step the position
    velocities[i * 3 + 0] += dt * acceleration[i * 3 + 0];
    velocities[i * 3 + 1] += dt * acceleration[i * 3 + 1];
    velocities[i * 3 + 2] += dt * acceleration[i * 3 + 2];

    positions[i * 3 + 0] += dt * velocities[i * 3 + 0];
    positions[i * 3 + 1] += dt * velocities[i * 3 + 1];
    positions[i * 3 + 2] += dt * velocities[i * 3 + 2];

    // step the rotation
    getQuat(rot, rotations, i);
    getQuat(vRot, velocitiesRot, i);
    quat.multiply(rot, rot, vRot);
    setQuat(rotations, i, rot);

    // check if the cell have changed
    getCells(cells2, positions[i * 3 + 0], positions[i * 3 + 2]);
    if (
      cells1[0] !== cells2[0] ||
      cells1[1] !== cells2[1] ||
      cells1[2] !== cells2[2]
    ) {
      for (let k = cells1.length; k--; ) grid[cells1[k]].delete(i);
      for (let k = cells2.length; k--; ) grid[cells2[k]].add(i);
    }
  }
};
