import * as THREE from 'three';

export function createMerkaba2(color1,color2) {
  const group = new THREE.Group();

  // 定义两个正四面体的顶点（共8个）
  const upperVertices = new Float32Array([
    // 上四面体（顺时针）
    2.414, 2.414, 2.414,   // 0
    -2.414, -2.414, 2.414,   // 1
    -2.414, 2.414, -2.414,   // 2
    2.414, -2.414, -2.414,   // 3
  ]);
  const lowerVertices = upperVertices.map(x => -x);

  const faces = new Uint16Array([
    // 上四面体（顺时针）
    0, 1, 2,   // 面0
    0, 2, 3,   // 面1
    0, 3, 1,   // 面2
    1, 2, 3,   // 面3
  ]);
  // 创建上四面体几何体
  const upperGeo = new THREE.BufferGeometry();
  upperGeo.setAttribute('position', new THREE.BufferAttribute(upperVertices, 3));
  upperGeo.setIndex(new THREE.BufferAttribute(faces, 1));
  upperGeo.computeVertexNormals();

  // 创建下四面体几何体
  const lowerGeo = new THREE.BufferGeometry();
  lowerGeo.setAttribute('position', new THREE.BufferAttribute(lowerVertices, 3));
  lowerGeo.setIndex(new THREE.BufferAttribute(faces, 1));
  lowerGeo.computeVertexNormals();

  // 创建材质和网格
  const upperMaterial = new THREE.MeshPhongMaterial({
    color: 0xFF6B6B, // 珊瑚红
    side: THREE.DoubleSide, // 可选：双面渲染
    transparent: true,
    opacity: 0.3,
    emissive: color1 || 'purple',  // 自发光红色边缘
    emissiveIntensity: 2,
  });
  const lowerMaterial = new THREE.MeshPhongMaterial({
    color: 0x4ECDC4, // 蒂芙尼蓝
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.3,
    emissive: color2 || 0x4ECDC4,  // 自发光红色边缘
    emissiveIntensity: 5,
  });

  const upperMesh = new THREE.Mesh(upperGeo, upperMaterial);
  const lowerMesh = new THREE.Mesh(lowerGeo, lowerMaterial);

  // 组合到Group
  group.add(upperMesh);
  group.add(lowerMesh);

  return group;
}