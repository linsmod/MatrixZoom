import * as THREE from 'three';
/**
 * 将 Web 颜色名称转换为 RGB 对象或十六进制数字
 * 仅支持标准 Web/CSS 颜色名称（16种基础色）
 * @param {string} colorName - Web 颜色名称，如 'red', 'blue', 'gray', 'orange' 等
 * @param {string} format - 返回格式：'hex' | 'rgb' | 'object'，默认 'object'
 * @returns {number|Object|null} - 返回对应格式的颜色值，无效时返回 null
 */
function webColorToColor(colorName) {
    if (!colorName || typeof colorName !== 'string') {
        return null;
    }
    if(colorName.startsWith("#")){
        return parseInt(colorName, 16);
    }

    const name = colorName.trim().toLowerCase();

    // 标准 Web/CSS 颜色名称（16种）
    const webColors = {
        'black':   0x000000 ,
        'white':   0xffffff ,
        'red':     0xff0000 ,
        'green':   0x00ff00 ,
        'blue':    0x0000ff ,
        'yellow':  0xffff00 ,
        'cyan':    0x00ffff ,
        'magenta': 0xff00ff ,
        'gray':    0x808080 ,
        'grey':    0x808080 ,
        'maroon':  0x800000 ,
        'olive':   0x808000 ,
        'purple':  0x800080 ,
        'teal':    0x008080 ,
        'navy':    0x000080 ,
        'silver':  0xc0c0c0
    };

    const color = webColors[name];
    if (!color) return null;

    return color;
}
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
        emissive: 0x000000, // 黑色，不发光
        emissiveIntensity: 0, // 发光强度为0
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
        emissive: 0x000000, // 黑色，不发光
        emissiveIntensity: 0, // 发光强度为0
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
