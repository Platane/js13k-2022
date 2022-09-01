import { mat4, vec3 } from "gl-matrix";
import { gl } from "../../../canvas";
import { nParticles, particles } from "../../../particles";
import { lookAtMatrix, perspectiveMatrix } from "../../camera";

export const worldMatrixBuffer = gl.createBuffer();
export const normalTransformMatrixBuffer = gl.createBuffer();
export const colorBuffer = gl.createBuffer();

const colors = new Float32Array(4 * nParticles);

const worldMatrix = new Float32Array(16 * nParticles);
const worldMatrices = Array.from(
  { length: nParticles },
  (_, i) => new Float32Array(worldMatrix.buffer, i * 16 * 4, 16)
);

const normalTransformMatrix = new Float32Array(16 * nParticles);
const normalTransformMatrices = Array.from(
  { length: nParticles },
  (_, i) => new Float32Array(normalTransformMatrix.buffer, i * 16 * 4, 16)
);

const transformMatrix = mat4.create();

export const updateTransform = () => {
  for (let i = nParticles; i--; ) {
    const { position, rotation, color } = particles[i];

    // set the world matrix
    mat4.fromRotationTranslation(transformMatrix, rotation, position);
    mat4.multiply(transformMatrix, lookAtMatrix, transformMatrix);
    mat4.multiply(worldMatrices[i], perspectiveMatrix, transformMatrix);

    // set the normal transform matrix
    mat4.invert(normalTransformMatrices[i], transformMatrix);
    mat4.transpose(normalTransformMatrices[i], normalTransformMatrices[i]);

    // set the color
    colors[i * 4 + 0] = color[0];
    colors[i * 4 + 1] = color[1];
    colors[i * 4 + 2] = color[2];
    colors[i * 4 + 3] = 1;
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, worldMatrixBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, worldMatrix, gl.DYNAMIC_DRAW);
  // gl.bufferSubData(gl.ARRAY_BUFFER, 0, worldMatrix);

  gl.bindBuffer(gl.ARRAY_BUFFER, normalTransformMatrixBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, normalTransformMatrix, gl.DYNAMIC_DRAW);
  // gl.bufferSubData(gl.ARRAY_BUFFER, 0, normalMatrix);

  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
  // gl.bufferSubData(gl.ARRAY_BUFFER, 0, normalMatrix);
};
