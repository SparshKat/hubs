import { BatchManager, BatchRawUniformGroup } from "three-render-manager";

import unlitBatchVert from "./render-manager/unlit-batch.vert";
import unlitBatchFrag from "./render-manager/unlit-batch.frag";

const tempVec3 = new Array(3);
const tempVec4 = new Array(4);

export const INSTANCE_DATA_BYTE_LENGTH = 112;

class HubsBatchRawUniformGroup extends BatchRawUniformGroup {
  constructor(maxInstances, meshToEl) {
    const hubsDataSize =
      maxInstances * 4 * 4 + // sweepParams
      4 *
        (3 + // interactorOnePos
        1 + // isFrozen
        3 + // interactorTwoPos
          1); // time

    const data = new ArrayBuffer(maxInstances * INSTANCE_DATA_BYTE_LENGTH + hubsDataSize);
    super(maxInstances, "InstanceData", data);

    let offset = this.offset;
    this.hubs_sweepParams = new Float32Array(this.data, offset, 4 * maxInstances);
    offset += this.hubs_sweepParams.byteLength;

    this.hubs_interactorOnePos = new Float32Array(this.data, offset, 3);
    offset += this.hubs_interactorOnePos.byteLength;

    this.hubs_isFrozen = new Uint32Array(this.data, offset, 1);
    offset += this.hubs_isFrozen.byteLength;

    this.hubs_interactorTwoPos = new Float32Array(this.data, offset, 3);
    offset += this.hubs_interactorTwoPos.byteLength;

    this.hubs_time = new Float32Array(this.data, offset, 1);
    offset += this.hubs_time.byteLength;

    this.offset = offset;

    this.meshToEl = meshToEl;
  }

  update(instanceId, mesh) {
    mesh.updateMatrices();

    super.update(instanceId, mesh);

    const el = this.meshToEl.get(mesh);
    if (el) {
      const obj = el.object3D;
      const hoverableVisuals = el.components["hoverable-visuals"];
      const worldY = obj.matrixWorld.elements[13];
      const scaledRadius = obj.scale.y * hoverableVisuals.boundingSphere.radius;

      const isPinned = el.components.pinnable && el.components.pinnable.data.pinned;
      const isSpawner = !!el.components["super-spawner"];
      const isFrozen = el.sceneEl.is("frozen");
      const hideDueToPinning = !isSpawner && isPinned && !isFrozen;

      const interaction = AFRAME.scenes[0].systems.interaction;
      let interactorOne, interactorTwo;
      if (interaction.state.leftHand.hovered === el || interaction.state.leftHand.held === el) {
        interactorOne = interaction.options.leftHand.entity.object3D;
      }

      if (interaction.state.rightRemote.hovered === el || interaction.state.rightRemote.held === el) {
        interactorTwo = interaction.options.rightRemote.entity.object3D;
      } else if (interaction.state.rightHand.hovered === el || interaction.state.rightHand.held === el) {
        interactorTwo = interaction.options.rightHand.entity.object3D;
      }

      tempVec4[0] = worldY - scaledRadius;
      tempVec4[1] = worldY + scaledRadius;
      tempVec4[2] = !!interactorOne && !hideDueToPinning;
      tempVec4[3] = !!interactorTwo && !hideDueToPinning;
      this.hubs_sweepParams.set(tempVec4, instanceId * 4);

      if (interactorOne) {
        tempVec3[0] = interactorOne.matrixWorld.elements[12];
        tempVec3[1] = interactorOne.matrixWorld.elements[13];
        tempVec3[2] = interactorOne.matrixWorld.elements[14];
        this.hubs_interactorOnePos.set(tempVec3);
      }

      if (interactorTwo) {
        tempVec3[0] = interactorTwo.matrixWorld.elements[12];
        tempVec3[1] = interactorTwo.matrixWorld.elements[13];
        tempVec3[2] = interactorTwo.matrixWorld.elements[14];
        this.hubs_interactorTwoPos.set(tempVec3);
      }
    }
  }
}

export class RenderManagerSystem {
  constructor(scene, renderer) {
    const maxInstances = 256;
    this.meshToEl = new WeakMap();
    this.ubo = new HubsBatchRawUniformGroup(maxInstances, this.meshToEl);
    this.batchManager = new BatchManager(scene, renderer, {
      maxInstances: maxInstances,
      ubo: this.ubo,
      shaders: {
        unlit: {
          vertexShader: unlitBatchVert,
          fragmentShader: unlitBatchFrag
        }
      }
    });
  }

  addObject(rootObject) {
    rootObject.updateMatrixWorld(true);
    let batchedCount = 0;
    rootObject.traverse(object => {
      if (object.isMesh && !object.isSkinnedMesh && !object.material.transparent && object.name !== "NavMesh") {
        if (this.batchManager.addMesh(object)) {
          object.batched = true;
          batchedCount++;
        }
      }
    });
    return batchedCount;
  }

  removeObject(rootObject) {
    rootObject.traverse(object => {
      if (object.isMesh && !object.isSkinnedMesh && !object.material.transparent && object.name !== "NavMesh") {
        this.batchManager.removeMesh(object);
        object.batched = false;
      }
    });
  }

  tick(time) {
    this.ubo.hubs_time[0] = time;
    this.ubo.hubs_isFrozen[0] = AFRAME.scenes[0].is("frozen") ? 1 : 0;
    this.batchManager.update(time);
  }

  remove() {}
}
