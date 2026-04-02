import * as THREE from 'three';

// 创建四面体几何体（上四面体）
function createUpperTetraGeometry() {
  const upperVertices = new Float32Array([
    // 上四面体（顺时针）
    2.414, 2.414, 2.414,   // 0
    -2.414, -2.414, 2.414,   // 1
    -2.414, 2.414, -2.414,   // 2
    2.414, -2.414, -2.414,   // 3
  ]);

  const faces = new Uint16Array([
    0, 1, 2,   // 面0
    0, 2, 3,   // 面1
    0, 3, 1,   // 面2
    1, 2, 3,   // 面3
  ]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(upperVertices, 3));
  geometry.setIndex(new THREE.BufferAttribute(faces, 1));
  geometry.computeVertexNormals();
  
  return geometry;
}

// 创建四面体几何体（下四面体）
function createLowerTetraGeometry() {
  const upperVertices = new Float32Array([
    2.414, 2.414, 2.414,
    -2.414, -2.414, 2.414,
    -2.414, 2.414, -2.414,
    2.414, -2.414, -2.414,
  ]);
  const lowerVertices = upperVertices.map(x => -x);

  const faces = new Uint16Array([
    0, 1, 2,
    0, 2, 3,
    0, 3, 1,
    1, 2, 3,
  ]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(lowerVertices, 3));
  geometry.setIndex(new THREE.BufferAttribute(faces, 1));
  geometry.computeVertexNormals();
  
  return geometry;
}

// 导出模板数据（几何体和材质配置）
export function getMerkabaTemplates(color1 = 'blue', color2 = 'orange') {
  return {
    upperTetra: {
      geometry: createUpperTetraGeometry(),
      materialConfig: {
        color: 0xFF6B6B, // 珊瑚红
        side: THREE.DoubleSide,
        emissive: color1,
        emissiveIntensity: 0.5, // 降低发光强度
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }
    },
    lowerTetra: {
      geometry: createLowerTetraGeometry(),
      materialConfig: {
        color: 0x4ECDC4, // 蒂芙尼蓝
        side: THREE.DoubleSide,
        emissive: color2,
        emissiveIntensity: 0.8, // 降低发光强度
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: 1,
      }
    }
  };
}

// 保留原函数用于创建控制用的本体（不可见，仅用于计算）
export function createMerkaba2(color1, color2) {
  const group = new THREE.Group();
  const templates = getMerkabaTemplates(color1, color2);

  const upperMesh = new THREE.Mesh(
    templates.upperTetra.geometry,
    new THREE.MeshPhongMaterial({
      ...templates.upperTetra.materialConfig,
      transparent: true,
      opacity: 0, // 不可见，仅用于计算
    })
  );
  const lowerMesh = new THREE.Mesh(
    templates.lowerTetra.geometry,
    new THREE.MeshPhongMaterial({
      ...templates.lowerTetra.materialConfig,
      transparent: true,
      opacity: 0, // 不可见，仅用于计算
    })
  );

  group.add(upperMesh);
  group.add(lowerMesh);

  return group;
}
