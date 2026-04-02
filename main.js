import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { OutlineEffect } from 'three/examples/jsm/Addons.js';
import { createMerkaba2, getMerkabaTemplates } from './mkb2';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';

// 统一的影子系统 - 所有对象都从模板生成，不再区分本体和影子
class SimulationSystem {
    constructor(scene, maxMeshes = 200, maxLines = 200) {
        this.scene = scene;
        this.maxMeshes = maxMeshes; // mesh最大数量
        this.maxLines = maxLines;   // line最大数量
        this.ghosts = [];
        this.ghostGroup = new THREE.Group();
        this.scene.add(this.ghostGroup);
        this.frames = 0; // 模拟帧计数
        this.lifetime = 200;
        this.templates = new Map(); // 模板存储：key -> { geometry, materialConfig }
    }

    // 注册模板（几何体和材质配置）
    registerTemplate(key, geometry, materialConfig) {
        this.templates.set(key, {
            geometry: geometry.clone(),
            materialConfig: { ...materialConfig }
        });
    }

    // 从模板创建网格实例
    createFromTemplate(key, matrixWorld, opacity = 0.3) {
        const template = this.templates.get(key);
        if (!template) return null;

        // 根据透明度衰减发光强度
        const baseEmissiveIntensity = template.materialConfig.emissiveIntensity || 0;
        const adjustedEmissiveIntensity = baseEmissiveIntensity * opacity * 0.6;

        const material = new THREE.MeshPhongMaterial({
            ...template.materialConfig,
            transparent: true,
            opacity: opacity,
            blending: THREE.NormalBlending, // 使用正常混合模式，避免发光效果
            depthWrite: false, // 禁用深度写入，让线段能透过显示
            depthTest: false, // 禁用深度测试，避免GPU绘制闪烁
            emissiveIntensity: adjustedEmissiveIntensity, // 发光强度随透明度衰减
        });

        const mesh = new THREE.Mesh(template.geometry.clone(), material);
        mesh.renderOrder = 0; // 确保渲染顺序一致
        mesh.applyMatrix4(matrixWorld);
        return mesh;
    }

    // 获取当前填充率（0-1）
    getFilling() {
        return this.ghosts.length / (this.maxMeshes + this.maxLines);
    }

    // 计算调整后的透明度（基于填充率）
    calculateAdjustedOpacity(baseOpacity) {
        const filling = this.getFilling();
        return baseOpacity * (1 - filling * 0.8); // 最多衰减80%
    }

    // 添加网格快照（从模板生成）
    addMeshSnapshot(templateKey, matrixWorld, baseOpacity = 0.3, lifetime = 30) {
        // 只计算mesh数量
        const meshCount = this.ghosts.filter(g => g.type === 'mesh').length;
        if (meshCount >= this.maxMeshes) {
            this._removeOldestMesh();
        }

        const adjustedOpacity = this.calculateAdjustedOpacity(baseOpacity);
        const mesh = this.createFromTemplate(templateKey, matrixWorld, adjustedOpacity);
        if (!mesh) return;

        // 获取模板的基础发光强度用于后续衰减
        const template = this.templates.get(templateKey);
        const baseEmissiveIntensity = template ? (template.materialConfig.emissiveIntensity || 0) : 0;
        this.ghostGroup.add(mesh);
        this.ghosts.push({
            object: mesh,
            type: 'mesh',
            templateKey,
            maxOpacity: adjustedOpacity,
            baseEmissiveIntensity: baseEmissiveIntensity, // 保存基础发光强度
            lifetime: lifetime,
            maxLifetime: lifetime,
            bornFrame: this.frames
        });
    }

    // 添加线段残影（拖尾轨迹）- 使用Line2实现粗线条
    addLineGhost(start, end, color, opacity = 0.5, lifetime = 6000) {
        // 只计算line数量
        const lineCount = this.ghosts.filter(g => g.type === 'line').length;
        if (lineCount >= this.maxLines) {
            this._removeOldestLine();
        }

        // 使用 LineGeometry 和 LineMaterial 实现粗线条
        const lineGeometry = new LineGeometry();
        const positions = new Float32Array([
            start.x, 0.02, start.z,
            end.x, 0.02, end.z
        ]);
        lineGeometry.setPositions(positions);
        
        const adjustedOpacity = this.calculateAdjustedOpacity(opacity);
        const lineMaterial = new LineMaterial({
            color: color,
            linewidth: 3, // 线宽（像素）
            transparent: true,
            opacity: adjustedOpacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false, // 禁用深度写入
            depthTest: false, // 禁用深度测试，线段始终显示在最前面
            resolution: new THREE.Vector2(window.innerWidth, window.innerHeight)
        });

        const line = new Line2(lineGeometry, lineMaterial);
        line.computeLineDistances();
        line.renderOrder = 1; // 确保线段在网格之后渲染
        this.ghostGroup.add(line);

        this.ghosts.push({
            object: line,
            type: 'line',
            maxOpacity: adjustedOpacity,
            lifetime: lifetime,
            maxLifetime: lifetime,
            bornFrame: this.frames
        });
    }

    // 添加梅尔卡巴快照（两个四面体）
    addMerkabaSnapshot(upperMatrix, lowerMatrix, baseOpacity = 0.3, lifetime = 1000) {
        this.addMeshSnapshot('upperTetra', upperMatrix, baseOpacity, lifetime);
        this.addMeshSnapshot('lowerTetra', lowerMatrix, baseOpacity, lifetime);
    }

    // 移除最老的mesh影子
    _removeOldestMesh() {
        const meshIndex = this.ghosts.findIndex(g => g.type === 'mesh');
        if (meshIndex !== -1) {
            const oldest = this.ghosts.splice(meshIndex, 1)[0];
            this.ghostGroup.remove(oldest.object);
            oldest.object.geometry.dispose();
            oldest.object.material.dispose();
        }
    }

    // 移除最老的line影子
    _removeOldestLine() {
        const lineIndex = this.ghosts.findIndex(g => g.type === 'line');
        if (lineIndex !== -1) {
            const oldest = this.ghosts.splice(lineIndex, 1)[0];
            this.ghostGroup.remove(oldest.object);
            oldest.object.geometry.dispose();
            oldest.object.material.dispose();
        }
    }

    // 推进模拟一步
    simulationUpdateAnim() {
        // 更新所有影子的透明度衰减
        for (let i = this.ghosts.length - 1; i >= 0; i--) {
            const ghostData = this.ghosts[i];
            const age = this.frames - ghostData.bornFrame;
            const lifeRatio = 1 - (age / ghostData.maxLifetime);

            if (lifeRatio <= 0 || age >= ghostData.maxLifetime) {
                this.ghostGroup.remove(ghostData.object);
                ghostData.object.geometry.dispose();
                ghostData.object.material.dispose();
                this.ghosts.splice(i, 1);
            } else {
                const newOpacity = lifeRatio * ghostData.maxOpacity;
                // 透明度为0时也删除
                if (newOpacity <= 0.001) {
                    this.ghostGroup.remove(ghostData.object);
                    ghostData.object.geometry.dispose();
                    ghostData.object.material.dispose();
                    this.ghosts.splice(i, 1);
                } else {
                    ghostData.object.material.opacity = newOpacity;
                    // 同步衰减发光强度（仅对网格类型）
                    if (ghostData.type === 'mesh' && ghostData.object.material.emissiveIntensity !== undefined) {
                        const baseEmissiveIntensity = ghostData.baseEmissiveIntensity || 0;
                        ghostData.object.material.emissiveIntensity = baseEmissiveIntensity * newOpacity * 0.6;
                    }
                }
            }
        }
    }

    // 清除所有影子
    clear() {
        for (const ghostData of this.ghosts) {
            this.ghostGroup.remove(ghostData.object);
            ghostData.object.geometry.dispose();
            ghostData.object.material.dispose();
        }
        this.ghosts = [];
    }
}

// 计算边与地面(y=0平面)的夹角
function calculateAngleWithGround(edgeStart, edgeEnd) {
    // 边的方向向量
    const edgeDir = new THREE.Vector3().subVectors(edgeEnd, edgeStart).normalize();
    
    // 地面法向量 (0, 1, 0)
    const groundNormal = new THREE.Vector3(0, 1, 0);
    
    // 计算边与地面法向量的夹角
    const angleWithNormal = Math.acos(Math.abs(edgeDir.dot(groundNormal)));
    
    // 边与地面的夹角 = 90度 - 与法向量的夹角
    const angleWithGround = Math.PI / 2 - angleWithNormal;
    
    return Math.abs(angleWithGround);
}

// 计算边与地面(y=0平面)的交点
// 返回 null 如果边不与地面相交
function calculateEdgeGroundIntersection(edgeStart, edgeEnd) {
    const y1 = edgeStart.y;
    const y2 = edgeEnd.y;
    
    // 检查边是否与地面相交
    // 两个端点必须在地面两侧（一个y>0，一个y<0）
    if (y1 * y2 > 0) {
        return null; // 两端点在同一侧，无交点
    }
    
    // 如果两个端点都在地面上，返回中点
    if (y1 === 0 && y2 === 0) {
        return new THREE.Vector3().addVectors(edgeStart, edgeEnd).multiplyScalar(0.5);
    }
    
    // 计算交点参数 t
    // 使用线性插值: P = P1 + t * (P2 - P1)
    // 当 y = 0 时: 0 = y1 + t * (y2 - y1)
    // t = -y1 / (y2 - y1)
    const t = -y1 / (y2 - y1);
    
    // 确保 t 在 [0, 1] 范围内
    if (t < 0 || t > 1) {
        return null;
    }
    
    // 计算交点
    const intersection = new THREE.Vector3().lerpVectors(edgeStart, edgeEnd, t);
    intersection.y = 0; // 确保y为0
    
    return intersection;
}

// 获取四面体的边
function getTetrahedronEdges(vertexPositions) {
    // 四面体有6条边: 0-1, 0-2, 0-3, 1-2, 1-3, 2-3
    const edgeIndices = [
        [0, 1], [0, 2], [0, 3],
        [1, 2], [1, 3], [2, 3]
    ];
    
    const edges = [];
    for (const [i, j] of edgeIndices) {
        const start = new THREE.Vector3(
            vertexPositions[i * 3],
            vertexPositions[i * 3 + 1],
            vertexPositions[i * 3 + 2]
        );
        const end = new THREE.Vector3(
            vertexPositions[j * 3],
            vertexPositions[j * 3 + 1],
            vertexPositions[j * 3 + 2]
        );
        edges.push({ start, end, indices: [i, j] });
    }
    return edges;
}

// 场景设置
const scene = new THREE.Scene();

// 创建天空背景
function createSky() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    
    // 创建渐变天空
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#0a0a20');      // 顶部深蓝
    gradient.addColorStop(0.3, '#1a1a40');    // 深蓝紫
    gradient.addColorStop(0.5, '#2a2a50');    // 中间色调
    gradient.addColorStop(0.7, '#3a3a60');    // 浅紫
    gradient.addColorStop(1, '#1a1a30');      // 底部深色
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // 添加星星
    for (let i = 0; i < 200; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height * 0.7; // 星星主要在上半部分
        const radius = Math.random() * 1.5;
        const opacity = Math.random() * 0.8 + 0.2;
        
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        context.fill();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    const geometry = new THREE.SphereGeometry(500, 32, 32);
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.BackSide
    });
    
    return new THREE.Mesh(geometry, material);
}

const sky = createSky();
scene.add(sky);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('container').appendChild(renderer.domElement);

// 创建透视相机和正交相机
const aspect = window.innerWidth / window.innerHeight;
const perspectiveCamera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
const frustumSize = 10;
const orthographicCamera = new THREE.OrthographicCamera(
    frustumSize * aspect / -2,
    frustumSize * aspect / 2,
    frustumSize / 2,
    frustumSize / -2,
    0.1,
    1000
);

// 当前使用的相机
let camera = perspectiveCamera;
let currentProjectionMode = 'perspective';

// 设置初始相机位置（从Z轴正方向看向原点，使Z轴正对相机）
perspectiveCamera.position.set(0, 0, 10);
orthographicCamera.position.set(0, 0, 10);

// 创建地面
function createGround() {
    // 半透明地面（与物体材质属性一致）
    const groundGeometry = new THREE.PlaneGeometry(20, 20);
    const groundMaterial = new THREE.MeshPhongMaterial({
        // color: 'green',
        side: THREE.FrontSide,
        opacity: 0.8,
        blending: THREE.MultiplyBlending,
        emissive: 'gray',
        emissiveIntensity: 5,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01; // 略低于网格线
    scene.add(ground);

    // 网格线
    const gridMaterial = new THREE.LineBasicMaterial({ color: 0x444444 });
    const gridGeometry = new THREE.BufferGeometry();
    const gridVertices = [];
    const gridSize = 10;
    const gridStep = 0.5;

    // 创建垂直线
    for (let x = -gridSize; x <= gridSize; x += gridStep) {
        gridVertices.push(x, 0, -gridSize);
        gridVertices.push(x, 0, gridSize);
    }

    // 创建水平线
    for (let z = -gridSize; z <= gridSize; z += gridStep) {
        gridVertices.push(-gridSize, 0, z);
        gridVertices.push(gridSize, 0, z);
    }

    gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gridVertices, 3));
    const gridLines = new THREE.LineSegments(gridGeometry, gridMaterial);
    scene.add(gridLines);
}

createGround();

// 添加坐标轴
const axesHelper = new THREE.AxesHelper(2);
scene.add(axesHelper);

// 创建文字纹理
function createTextTexture(text, color) {
    // 创建文字标注
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 64;
    canvas.height = 64;

    context.fillStyle = 'black';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = color;
    context.font = 'bold 48px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    return new THREE.CanvasTexture(canvas);
}

// 创建文字精灵
function createTextSprite(text, color, position) {
    const texture = createTextTexture(text, color);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(0.5, 0.5, 0.5);
    sprite.position.copy(position);
    return sprite;
}

// 添加坐标轴标注
const xLabel = createTextSprite('X', '#ff0000', new THREE.Vector3(12, 0, 0));
const yLabel = createTextSprite('Y', '#00ff00', new THREE.Vector3(0, 12, 0));
const zLabel = createTextSprite('Z', '#0000ff', new THREE.Vector3(0, 0, 12));

scene.add(xLabel);
scene.add(yLabel);
scene.add(zLabel);

// 添加环境光
const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
scene.add(ambientLight);

// 添加点光源
const pointLight = new THREE.PointLight(0xffffff, 1, 100);
pointLight.position.set(5, 5, 5);
pointLight.castShadow = true;
scene.add(pointLight);

// 添加第二个点光源
const pointLight2 = new THREE.PointLight(0xffffff, 1, 100);
pointLight2.position.set(-5, -5, -5);
pointLight2.castShadow = true;
scene.add(pointLight2);

// 控制器设置
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.screenSpacePanning = false;
controls.minDistance = 3;
controls.maxDistance = 15;
controls.maxPolarAngle = Math.PI / 2;
controls.update();

// 相机视角变化时保存到URL（防抖处理）
let saveCameraTimeout = null;
controls.addEventListener('change', () => {
    if (saveCameraTimeout) clearTimeout(saveCameraTimeout);
    saveCameraTimeout = setTimeout(() => {
        saveParamsToURL();
    }, 300);
});

// 投影模式切换
const projectionSelect = document.getElementById('projectionMode');

function switchCamera(mode) {
    const previousCamera = camera;
    
    if (mode === 'perspective') {
        camera = perspectiveCamera;
    } else {
        camera = orthographicCamera;
    }
    
    // 同步相机位置和朝向
    camera.position.copy(previousCamera.position);
    camera.quaternion.copy(previousCamera.quaternion);
    
    // 更新控制器
    controls.object = camera;
    controls.update();
    
    currentProjectionMode = mode;
}

projectionSelect.addEventListener('change', (e) => {
    switchCamera(e.target.value);
    saveParamsToURL();
});

// 魔方颜色
const colors = [
    0xff0000, // 红
    0xff7f00, // 橙
    0xffff00, // 黄
    0x00ff00, // 绿
    0x0000ff, // 蓝
    0x4b0082, // 靛
    0x9400d3, // 紫
    0xff69b4  // 粉
];

// 创建魔方
const cubeSize = 1;
const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
const cubes = [];
const cubeGroup = new THREE.Group();
let colorIndex = 0;
// 创建2x2x2的魔方
function createCubes() {
    for (let x = -0.5; x <= 0.5; x++) {
        for (let y = -0.5; y <= 0.5; y++) {
            for (let z = -0.5; z <= 0.5; z++) {

                const material = new THREE.MeshPhongMaterial({
                    // color: colors[colorIndex%colors.length],
                    transparent: true,
                    // side: THREE.DoubleSide, // 可选：双面渲染
                    opacity: 0.6,
                    shininess: 100
                });
                colorIndex++
                const cube = new THREE.Mesh(cubeGeometry, material);
                cube.position.set(x, y, z);
                cube.castShadow = true;
                cube.receiveShadow = true;
                cubes.push(cube);
                cubeGroup.add(cube);
            }
        }
    }
}
// createCubes();





// 在创建cubes之后添加对角线
function createDiagonal() {
    // 创建几何体（定义两个端点）
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
        -2, -2, -2, // 起点（cubeGroup的左下角）
        2, 2, 2  // 终点（cubeGroup的右上角）
    ]);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

    // 创建材质（红色虚线）
    const material = new THREE.LineDashedMaterial({
        color: 'white',
        // linewidth: 0.1,
        // dashSize: 0.1,
        // gapSize: 0.05
    });

    // 创建线条并添加到cubeGroup
    const diagonalLine = new THREE.Line(geometry, material);
    cubeGroup.add(diagonalLine);
}

createDiagonal();


// 创建梅尔卡巴
// const merkaba = createMerkaba();
// cubeGroup.add(merkaba);


// 新增：将cubeGroup的对角线旋转到世界z轴方向
function alignDiagonalToZAxis() {
    const direction = new THREE.Vector3(1, 1, 1);

    // 目标方向为世界y轴
    const targetDir = new THREE.Vector3(0, 1, 0);

    // 计算旋转轴和角度
    const axis = new THREE.Vector3().crossVectors(direction, targetDir).normalize();
    const angle = direction.angleTo(targetDir);


    // 应用旋转
    const quaternion = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    cubeGroup.applyQuaternion(quaternion);
}

alignDiagonalToZAxis(); // 执行旋转

// 保存cubeGroup的初始四元数，用于计算倾斜角
const initialQuaternion = cubeGroup.quaternion.clone();

const merkaba2 = createMerkaba2('blue', 'orange');
cubeGroup.add(merkaba2);
// 发光强度控制（控制中心点光源亮度）
let currentEmissiveIntensity = 200;
// 在cubeGroup中心添加点光源，实现整体发光效果
const groupLight = new THREE.PointLight(0xffffff, currentEmissiveIntensity, 5);
groupLight.position.set(0, 0, 0);
cubeGroup.add(groupLight);

scene.add(cubeGroup);

// 创建统一残影系统（同时处理网格残影和线段拖尾）
const simulationSystem = new SimulationSystem(scene, 120, 200); // mesh最大200个，line最大200个

// 注册梅尔卡巴模板
const merkabaTemplates = getMerkabaTemplates('blue', 'orange');
simulationSystem.registerTemplate('upperTetra', merkabaTemplates.upperTetra.geometry, merkabaTemplates.upperTetra.materialConfig);
simulationSystem.registerTemplate('lowerTetra', merkabaTemplates.lowerTetra.geometry, merkabaTemplates.lowerTetra.materialConfig);


const emissiveSliderValueElem = document.getElementById('emissiveIntensity');
const emissiveValueLabel = document.getElementById('emissiveValueLabel');
emissiveValueLabel.textContent = currentEmissiveIntensity.toFixed(0);
emissiveSliderValueElem.value = currentEmissiveIntensity.toFixed(0);

// 更新中心光源强度
function updateEmissiveIntensity(intensity) {
    currentEmissiveIntensity = intensity;
    groupLight.intensity = intensity;
}
emissiveSliderValueElem.parentElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = parseFloat(emissiveSliderValueElem.getAttribute('step')) || 1;
    const min = parseFloat(emissiveSliderValueElem.getAttribute('min'));
    const max = parseFloat(emissiveSliderValueElem.getAttribute('max'));
    const currentValue = parseFloat(emissiveSliderValueElem.value);
    // 向下滚动增加，向上滚动减少
    const delta = e.deltaY > 0 ? step : -step;
    const value = currentValue + delta;
    if (value < min || value > max) return;
    emissiveSliderValueElem.value = value;
    emissiveValueLabel.textContent = value.toFixed(0);
    updateEmissiveIntensity(value);
});
emissiveSliderValueElem.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    emissiveValueLabel.textContent = value.toFixed(0);
    updateEmissiveIntensity(value);
    saveParamsToURL();
});

// 存储上一帧的交点位置，用于绘制线段
let previousIntersections = { upper: new Map(), lower: new Map() };

// ========== 倾斜角控制 ==========
const tiltAngleZSlider = document.getElementById('tiltAngleZ');
const tiltAngleZValueLabel = document.getElementById('tiltAngleZValue');
const tiltAngleXSlider = document.getElementById('tiltAngleX');
const tiltAngleXValueLabel = document.getElementById('tiltAngleXValue');

// 当前倾斜角状态
let currentTiltAngleZ = 0;
let currentTiltAngleX = 0;

// 通过slider设置倾斜角（同时应用Z轴和X轴倾斜）
function setTiltAngles(angleZDegrees, angleXDegrees) {
    // 重置cubeGroup的四元数为初始状态
    cubeGroup.quaternion.copy(initialQuaternion);
    
    // 先绕世界Z轴旋转（向右侧X轴正方向倾斜）
    const worldForward = new THREE.Vector3(0, 0, 1);
    cubeGroup.rotateOnWorldAxis(worldForward, THREE.MathUtils.degToRad(angleZDegrees));
    
    // 再绕世界X轴旋转（向前/后倾斜）
    const worldRight = new THREE.Vector3(1, 0, 0);
    cubeGroup.rotateOnWorldAxis(worldRight, THREE.MathUtils.degToRad(angleXDegrees));
}

// 更新倾斜角显示（从物体当前姿态反推倾斜角）
function updateTiltAngleDisplay() {
    // 由于倾斜角是相对于初始状态的，我们直接显示当前保存的值
    // 这个函数在鼠标拖动时调用，需要从四元数反推
    // 简化处理：直接显示当前保存的值
    tiltAngleZSlider.value = currentTiltAngleZ.toFixed(1);
    tiltAngleZValueLabel.textContent = currentTiltAngleZ.toFixed(1);
    tiltAngleXSlider.value = currentTiltAngleX.toFixed(1);
    tiltAngleXValueLabel.textContent = currentTiltAngleX.toFixed(1);
}

// 监听Z轴slider变化
tiltAngleZSlider.addEventListener('input', (e) => {
    currentTiltAngleZ = parseFloat(e.target.value);
    tiltAngleZValueLabel.textContent = currentTiltAngleZ.toFixed(1);
    setTiltAngles(currentTiltAngleZ, currentTiltAngleX);
    saveParamsToURL();
});

// 监听X轴slider变化
tiltAngleXSlider.addEventListener('input', (e) => {
    currentTiltAngleX = parseFloat(e.target.value);
    tiltAngleXValueLabel.textContent = currentTiltAngleX.toFixed(1);
    setTiltAngles(currentTiltAngleZ, currentTiltAngleX);
    saveParamsToURL();
});

// 滚轮调整Z轴倾斜角
tiltAngleZSlider.parentElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = e.altKey ? 0.1 : 1;
    const delta = e.deltaY > 0 ? step : -step;
    const min = parseFloat(tiltAngleZSlider.getAttribute('min'));
    const max = parseFloat(tiltAngleZSlider.getAttribute('max'));
    const newValue = Math.max(min, Math.min(max, currentTiltAngleZ + delta));
    currentTiltAngleZ = newValue;
    tiltAngleZSlider.value = newValue.toFixed(1);
    tiltAngleZValueLabel.textContent = newValue.toFixed(1);
    setTiltAngles(currentTiltAngleZ, currentTiltAngleX);
});

// 滚轮调整X轴倾斜角
tiltAngleXSlider.parentElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = e.altKey ? 0.1 : 1;
    const delta = e.deltaY > 0 ? step : -step;
    const min = parseFloat(tiltAngleXSlider.getAttribute('min'));
    const max = parseFloat(tiltAngleXSlider.getAttribute('max'));
    const newValue = Math.max(min, Math.min(max, currentTiltAngleX + delta));
    currentTiltAngleX = newValue;
    tiltAngleXSlider.value = newValue.toFixed(1);
    tiltAngleXValueLabel.textContent = newValue.toFixed(1);
    setTiltAngles(currentTiltAngleZ, currentTiltAngleX);
});

// 重置按钮事件
document.getElementById('resetTiltZ').addEventListener('click', () => {
    currentTiltAngleZ = 0;
    tiltAngleZSlider.value = '0.0';
    tiltAngleZValueLabel.textContent = '0.0';
    setTiltAngles(currentTiltAngleZ, currentTiltAngleX);
    saveParamsToURL();
});

document.getElementById('resetTiltX').addEventListener('click', () => {
    currentTiltAngleX = 0;
    tiltAngleXSlider.value = '0.0';
    tiltAngleXValueLabel.textContent = '0.0';
    setTiltAngles(currentTiltAngleZ, currentTiltAngleX);
    saveParamsToURL();
});

// ========== URL参数保存与加载 ==========
function saveParamsToURL() {
    const params = new URLSearchParams();
    
    // 保存所有参数
    params.set('freq', rotationFrequency.toFixed(2));
    params.set('proj', currentProjectionMode);
    params.set('emissive', currentEmissiveIntensity.toFixed(0));
    params.set('tiltZ', currentTiltAngleZ.toFixed(1));
    params.set('tiltX', currentTiltAngleX.toFixed(1));
    
    // 保存相机位置
    params.set('cx', camera.position.x.toFixed(2));
    params.set('cy', camera.position.y.toFixed(2));
    params.set('cz', camera.position.z.toFixed(2));
    
    // 保存相机目标点
    params.set('tx', controls.target.x.toFixed(2));
    params.set('ty', controls.target.y.toFixed(2));
    params.set('tz', controls.target.z.toFixed(2));
    
    // 更新URL而不刷新页面
    const newURL = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newURL);
}

function loadParamsFromURL() {
    const params = new URLSearchParams(window.location.search);
    
    // 解析旋转频率
    if (params.has('freq')) {
        const freq = parseFloat(params.get('freq'));
        if (!isNaN(freq) && freq >= 0 && freq <= 100) {
            rotationFrequency = freq;
            rotationSpeed = rotationFrequency * Math.PI * 2;
            speedSlider.value = freq.toFixed(2);
            speedValue.textContent = freq.toFixed(2);
        }
    }
    
    // 解析投影模式
    if (params.has('proj')) {
        const proj = params.get('proj');
        if (proj === 'perspective' || proj === 'orthographic') {
            projectionSelect.value = proj;
            switchCamera(proj);
        }
    }
    
    // 解析发光强度
    if (params.has('emissive')) {
        const emissive = parseFloat(params.get('emissive'));
        if (!isNaN(emissive) && emissive >= 20 && emissive <= 800) {
            updateEmissiveIntensity(emissive);
            emissiveSliderValueElem.value = emissive.toFixed(0);
            emissiveValueLabel.textContent = emissive.toFixed(0);
        }
    }
    
    // 解析Z轴倾斜角
    if (params.has('tiltZ')) {
        const tiltZ = parseFloat(params.get('tiltZ'));
        if (!isNaN(tiltZ) && tiltZ >= 0 && tiltZ <= 90) {
            currentTiltAngleZ = tiltZ;
            tiltAngleZSlider.value = tiltZ.toFixed(1);
            tiltAngleZValueLabel.textContent = tiltZ.toFixed(1);
        }
    }
    
    // 解析X轴倾斜角
    if (params.has('tiltX')) {
        const tiltX = parseFloat(params.get('tiltX'));
        if (!isNaN(tiltX) && tiltX >= -90 && tiltX <= 90) {
            currentTiltAngleX = tiltX;
            tiltAngleXSlider.value = tiltX.toFixed(1);
            tiltAngleXValueLabel.textContent = tiltX.toFixed(1);
        }
    }
    
    // 应用倾斜角
    setTiltAngles(currentTiltAngleZ, currentTiltAngleX);
    
    // 解析相机位置
    if (params.has('cx') && params.has('cy') && params.has('cz')) {
        const cx = parseFloat(params.get('cx'));
        const cy = parseFloat(params.get('cy'));
        const cz = parseFloat(params.get('cz'));
        if (!isNaN(cx) && !isNaN(cy) && !isNaN(cz)) {
            camera.position.set(cx, cy, cz);
        }
    }
    
    // 解析相机目标点
    if (params.has('tx') && params.has('ty') && params.has('tz')) {
        const tx = parseFloat(params.get('tx'));
        const ty = parseFloat(params.get('ty'));
        const tz = parseFloat(params.get('tz'));
        if (!isNaN(tx) && !isNaN(ty) && !isNaN(tz)) {
            controls.target.set(tx, ty, tz);
            controls.update();
        }
    }
}

// 根据夹角计算粒子颜色（夹角越大颜色越亮）
function getParticleColorByAngle(angle, isUpper) {
    // angle范围: 0 到 PI/2
    const normalizedAngle = angle / (Math.PI / 2);
    
    // 上四面体用红色系，下四面体用蓝色系
    if (isUpper) {
        // 红色到黄色
        const r = 255;
        const g = Math.floor(normalizedAngle * 200);
        const b = 0;
        return (r << 16) | (g << 8) | b;
    } else {
        // 蓝色到青色
        const r = 0;
        const g = Math.floor(normalizedAngle * 200);
        const b = 255;
        return (r << 16) | (g << 8) | b;
    }
}

// 生成四面体边的线条轨迹
function generateTetrahedronLineTrails(tetraMesh, isUpper, worldMatrix, lifetime) {
    if (!tetraMesh || !tetraMesh.geometry) return;
    
    const positionAttr = tetraMesh.geometry.getAttribute('position');
    const localPositions = positionAttr.array;
    
    // 获取四面体的边
    const edges = getTetrahedronEdges(localPositions);
    
    // 当前帧的交点
    const currentIntersections = new Map();
    
    // 增加线段长度以获得更明显的轨迹
    const lineLength = 0.3; // 增加长度
    
    // 每帧生成的线段数量（密度）
    const linesPerEdge = 3; // 每条边生成3条线段
    
    for (const edge of edges) {
        // 将局部坐标转换为世界坐标
        const worldStart = edge.start.clone().applyMatrix4(worldMatrix);
        const worldEnd = edge.end.clone().applyMatrix4(worldMatrix);
        
        // 计算边与地面的交点
        const intersection = calculateEdgeGroundIntersection(worldStart, worldEnd);
        
        if (intersection) {
            // 用边的索引作为key
            const key = `${edge.indices[0]}-${edge.indices[1]}`;
            currentIntersections.set(key, intersection.clone());
            
            // 计算边与地面的夹角
            const angle = calculateAngleWithGround(worldStart, worldEnd);
            
            // 计算颜色和生命周期（帧数）
            const color = getParticleColorByAngle(angle, isUpper);
            
            // 计算切线方向并绘制线段
            // 旋转轴是(1,1,1)方向，在地面上的投影方向
            const rotationAxis = new THREE.Vector3(1, 1, 1).normalize();
            // 切线方向 = 位置向量 × 旋转轴
            const tangent = new THREE.Vector3().crossVectors(intersection, rotationAxis).normalize();
            // 投影到地面（y=0）
            tangent.y = 0;
            tangent.normalize();
            
            // 生成多条线段以增加密度
            for (let i = 0; i < linesPerEdge; i++) {
                // 添加微小的随机偏移，使线段不完全重叠
                const offset = (i / linesPerEdge) * lineLength * 0.3;
                const lineStart = intersection.clone().add(tangent.clone().multiplyScalar(offset));
                const lineEnd = lineStart.clone().add(tangent.clone().multiplyScalar(lineLength));
                simulationSystem.addLineGhost(lineStart, lineEnd, color, 0.4, lifetime);
            }
        }
    }
    
    return currentIntersections;
}



// 控制模式：'camera' 相机控制，'object' 物体控制
// 默认相机控制，按住 Ctrl 切换到物体控制
let controlMode = 'camera';

// Ctrl 键控制模式切换
window.addEventListener('keydown', (e) => {
    if (e.key === 'Control' && controlMode === 'camera') {
        controlMode = 'object';
        controls.enabled = false;
    }
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'Control' && controlMode === 'object') {
        controlMode = 'camera';
        controls.enabled = true;
    }
});

// 鼠标控制变量
let isDragging = false;
let previousMousePosition = {
    x: 0,
    y: 0
};

// 鼠标事件监听
renderer.domElement.addEventListener('mousedown', (event) => {
    // 只响应左键点击
    if (event.button === 0 && controlMode === 'object') {
        isDragging = true;
        previousMousePosition = {
            x: event.clientX,
            y: event.clientY
        };
    }
});

renderer.domElement.addEventListener('mousemove', (event) => {
    if (!isDragging) return;

    const deltaMove = {
        x: event.clientX - previousMousePosition.x,
        y: event.clientY - previousMousePosition.y
    };

    // 获取相机的右向量和上向量（世界坐标系）
    const cameraRight = new THREE.Vector3();
    const cameraUp = new THREE.Vector3();
    camera.matrix.extractBasis(cameraRight, cameraUp, new THREE.Vector3());

    // 绕相机右轴旋转（对应鼠标X移动）
    cubeGroup.rotateOnWorldAxis(cameraUp, deltaMove.x * 0.005);
    // 绕相机上轴旋转（对应鼠标Y移动）
    cubeGroup.rotateOnWorldAxis(cameraRight, deltaMove.y * 0.005);

    // 更新倾斜角显示
    updateTiltAngleDisplay();

    previousMousePosition = {
        x: event.clientX,
        y: event.clientY
    };
});

renderer.domElement.addEventListener('mouseup', (event) => {
    // 只响应左键释放
    if (event.button === 0) {
        isDragging = false;
        saveParamsToURL();
    }
});

// 触摸事件支持
renderer.domElement.addEventListener('touchstart', (event) => {
    if (controlMode === 'object') {
        isDragging = true;
        previousMousePosition = {
            x: event.touches[0].clientX,
            y: event.touches[0].clientY
        };
    }
});

renderer.domElement.addEventListener('touchmove', (event) => {
    if (!isDragging) return;

    const deltaMove = {
        x: event.touches[0].clientX - previousMousePosition.x,
        y: event.touches[0].clientY - previousMousePosition.y
    };

    // 获取相机的右向量和上向量（世界坐标系）
    const cameraRight = new THREE.Vector3();
    const cameraUp = new THREE.Vector3();
    camera.matrix.extractBasis(cameraRight, cameraUp, new THREE.Vector3());

    // 绕相机右轴旋转（对应鼠标X移动）
    cubeGroup.rotateOnWorldAxis(cameraUp, deltaMove.x * 0.005);
    // 绕相机上轴旋转（对应鼠标Y移动）
    cubeGroup.rotateOnWorldAxis(cameraRight, deltaMove.y * 0.005);

    // 更新倾斜角显示
    updateTiltAngleDisplay();

    previousMousePosition = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY
    };
    if(controlMode === 'object'){
        pendingTempFrames = parseInt(rotationFrequency*tempCycle);
        return;
    }
});

renderer.domElement.addEventListener('touchend', () => {
    isDragging = false;
    saveParamsToURL();
});
// 轮廓效果
// 初始化轮廓效果
const outlineEffect = new OutlineEffect(renderer, {
    defaultThickness: 0.005,
    defaultColor: [0, 1, 0],
    defaultAlpha: 1,
});
outlineEffect.enabled = true; // 启用轮廓效果
outlineEffect.autoClear = false; // 设置是否自动清除之前的渲染结果，通常设置为false以保持之前的渲染结果不变。

// 旋转速度控制
let rotationFrequency = 0.1; // 频率（Hz）
let pendingTempFrames = 0;
let rotationSpeed = rotationFrequency * Math.PI * 2; // 弧度/秒（每秒旋转的弧度数）
let paused = false;

const speedSlider = document.getElementById('rotationSpeed');
const speedValue = document.getElementById('speedValue');
const tempCycle = 15;
speedSlider.addEventListener('input', (e) => {
    e.preventDefault();
    rotationFrequency = parseFloat(e.target.value);
    rotationSpeed = rotationFrequency * Math.PI * 2;
    speedValue.textContent = rotationFrequency.toFixed(2);
    if(paused)
        pendingTempFrames = parseInt(rotationFrequency*tempCycle);
    saveParamsToURL();
});

// 鼠标悬停在controls区域时，支持滚轮调整频率
document.getElementById('controls').addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = e.altKey ? 0.01 : 0.1;
    const delta = e.deltaY > 0 ? -step : step;
    const minFreq = parseFloat(speedSlider.getAttribute('min'));
    const maxFreq = parseFloat(speedSlider.getAttribute('max'));
    let roteFreq = rotationFrequency + delta;
    // 限制频率在 min-max 范围内
    if(roteFreq < minFreq){
        roteFreq = minFreq;
    }
    else if(roteFreq > maxFreq){
        roteFreq = maxFreq;
    }
    rotationFrequency = roteFreq;
    rotationSpeed = roteFreq * Math.PI * 2;
    speedSlider.value = roteFreq;
    speedValue.textContent = roteFreq.toFixed(2);
    if(paused)
        pendingTempFrames = parseInt(rotationFrequency*tempCycle);
    saveParamsToURL();
});

// 空格键控制旋转暂停/继续
const pausedIndicator = document.getElementById('pausedIndicator');

window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        paused = !paused;
        // 切换 Paused 提示的显示
        if (paused) {
            pausedIndicator.classList.remove('hidden');
        } else {
            pausedIndicator.classList.add('hidden');
        }
    }
});

// ========== 高速模拟 + 分离渲染架构 ==========

// ========== 帧率统计 ==========
// 模拟帧率统计
let lastRenderTime = performance.now();
let lastSampleOfSimFrame = 0;
let simFPS = 0;
let simFreq = 0;
const simFPSDisplay = document.getElementById('simFPS');
const simFreqDisplay = document.getElementById('simFreq');

// 渲染帧率统计
let renderFrameCount = 0;
let renderFPS = 0;
const renderFPSDisplay = document.getElementById('renderFPS');
const ghostCountDisplay = document.getElementById('ghostCount');

// 帧率更新间隔（毫秒）
const fpsUpdateInterval = 500;

function stepSimulate() {
    const upperTetra = merkaba2.children[0];
    const lowerTetra = merkaba2.children[1];

    // 使用梅尔卡巴的中轴（对角线）作为旋转轴
    const axis = new THREE.Vector3(1, 1, 1).normalize();

    // 计算每次模拟的旋转角度
    const upperAngle = rotationSpeed/3; // 上四面体旋转角度
    const lowerAngle = rotationSpeed; // 下四面体旋转角度（3倍速）

    const quaternion = new THREE.Quaternion();

    // 上四面体顺时针旋转
    quaternion.setFromAxisAngle(axis, upperAngle);
    upperTetra.quaternion.multiplyQuaternions(quaternion, upperTetra.quaternion);

    // 下四面体逆时针旋转
    quaternion.setFromAxisAngle(axis, -lowerAngle);
    lowerTetra.quaternion.multiplyQuaternions(quaternion, lowerTetra.quaternion);

    // 强制更新世界矩阵
    upperTetra.updateMatrixWorld(true);
    lowerTetra.updateMatrixWorld(true);

    // 生成当前帧的影像（从模板创建，统一透明度策略）
    // 生成线条轨迹
    const upperWorldMatrix = new THREE.Matrix4().copy(upperTetra.matrixWorld);
    const lowerWorldMatrix = new THREE.Matrix4().copy(lowerTetra.matrixWorld);
    generateTetrahedronLineTrails(upperTetra, true, upperWorldMatrix, simulationSystem.lifetime);
    generateTetrahedronLineTrails(lowerTetra, false, lowerWorldMatrix, simulationSystem.lifetime);
    simulationSystem.addMerkabaSnapshot(upperWorldMatrix, lowerWorldMatrix, 0.3, simulationSystem.lifetime);
    simulationSystem.simulationUpdateAnim();
    simulationSystem.frames++;
}
// 启动高速模拟定时器
var simulationTimer = setInterval(()=>{
    // reset pendingTempFrames if paused is changed to false
    if(!paused){
        pendingTempFrames = 0;
    }
    if(!paused || pendingTempFrames>0){
        stepSimulate();
        pendingTempFrames--;
        if(pendingTempFrames<=0){
            pendingTempFrames = 0;
        }
    }
}, 0);

// 渲染循环 - 只负责渲染，与模拟分离
function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // 模拟系统具有更快的帧率，
    // 渲染系统只是渲染时对其采样
    const now = performance.now();
    renderFrameCount++;
    if (now - lastRenderTime >= fpsUpdateInterval) {
        simFPS = Math.round( (simulationSystem.frames - lastSampleOfSimFrame) * 1000 / (now - lastRenderTime));
        simFPSDisplay.textContent = simFPS;
        simFreq = rotationSpeed / (Math.PI * 2);
        simFreqDisplay.textContent = simFreq.toFixed(2);

        renderFPS = Math.round(renderFrameCount * 1000 / (now - lastRenderTime));
        renderFPSDisplay.textContent = renderFPS;
        renderFrameCount = 0;

        // 更新残影数量显示（只计算mesh类型，上下合并算一个梅尔卡巴）
        const meshCount = simulationSystem.ghosts.filter(g => g.type === 'mesh').length;
        ghostCountDisplay.textContent = Math.floor(meshCount / 2);

        lastSampleOfSimFrame = simulationSystem.frames;
        lastRenderTime = now;
    }
    // 渲染场景
    renderer.render(scene, camera);
}

// 窗口大小调整
window.addEventListener('resize', () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const newAspect = width / height;
    
    // 更新透视相机
    perspectiveCamera.aspect = newAspect;
    perspectiveCamera.updateProjectionMatrix();
    
    // 更新正交相机
    orthographicCamera.left = frustumSize * newAspect / -2;
    orthographicCamera.right = frustumSize * newAspect / 2;
    orthographicCamera.top = frustumSize / 2;
    orthographicCamera.bottom = frustumSize / -2;
    orthographicCamera.updateProjectionMatrix();
    
    renderer.setSize(width, height);
    
    // 更新所有LineMaterial的resolution
    for (const ghostData of simulationSystem.ghosts) {
        if (ghostData.type === 'line' && ghostData.object.material) {
            ghostData.object.material.resolution.set(width, height);
        }
    }
});

animate();

// 页面加载时从URL解析参数
loadParamsFromURL();
