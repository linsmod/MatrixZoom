import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { createMerkaba } from './mkb';
import { OutlineEffect } from 'three/examples/jsm/Addons.js';
import { createBackground } from './bg';
import { createMerkaba2 } from './mkb2';

// 粒子系统类 - 用于生成会消失的粒子轨迹
class ParticleTrailSystem {
    constructor(scene, maxParticles = 3000) {
        this.scene = scene;
        this.maxParticles = maxParticles;
        this.particles = [];
        this.trailGroup = new THREE.Group();
        this.scene.add(this.trailGroup);
        
        // 粒子几何体（小球）
        this.particleGeometry = new THREE.SphereGeometry(0.03, 8, 8);
    }
    
    // 创建单个粒子
    createParticle(position, color, lifetime = 3.0) {
        if (this.particles.length >= this.maxParticles) {
            // 移除最老的粒子
            const oldest = this.particles.shift();
            this.trailGroup.remove(oldest.mesh);
            oldest.mesh.geometry.dispose();
            oldest.mesh.material.dispose();
        }
        
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 1.0
        });
        
        const mesh = new THREE.Mesh(this.particleGeometry, material);
        mesh.position.copy(position);
        mesh.position.y = 0.01; // 稍微高于地面
        
        this.trailGroup.add(mesh);
        
        this.particles.push({
            mesh: mesh,
            lifetime: lifetime,
            maxLifetime: lifetime,
            createdAt: Date.now()
        });
    }
    
    // 更新所有粒子
    update(deltaTime) {
        const now = Date.now();
        
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            const age = (now - particle.createdAt) / 1000;
            
            if (age >= particle.maxLifetime) {
                // 粒子过期，移除
                this.trailGroup.remove(particle.mesh);
                particle.mesh.geometry.dispose();
                particle.mesh.material.dispose();
                this.particles.splice(i, 1);
            } else {
                // 更新透明度
                const lifeRatio = 1 - (age / particle.maxLifetime);
                particle.mesh.material.opacity = lifeRatio;
                // 粒子逐渐变小
                const scale = 0.5 + lifeRatio * 0.5;
                particle.mesh.scale.setScalar(scale);
            }
        }
    }
    
    // 清除所有粒子
    clear() {
        for (const particle of this.particles) {
            this.trailGroup.remove(particle.mesh);
            particle.mesh.geometry.dispose();
            particle.mesh.material.dispose();
        }
        this.particles = [];
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
        color: 'green',
        side: THREE.FrontSide,
        opacity: 0.5,
        blending: THREE.MultiplyBlending,
        emissive: 'gray',
        emissiveIntensity: 10,
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
const xLabel = createTextSprite('X', '#ff0000', new THREE.Vector3(6.1, 0, 0));
const yLabel = createTextSprite('Y', '#00ff00', new THREE.Vector3(0, 6.1, 0));
const zLabel = createTextSprite('Z', '#0000ff', new THREE.Vector3(0, 0, 6.1));

scene.add(xLabel);
scene.add(yLabel);
scene.add(zLabel);

// 添加环境光
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
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
const merkaba2 = createMerkaba2('blue', 'orange');
cubeGroup.add(merkaba2);

scene.add(cubeGroup);

// 创建粒子轨迹系统
const particleTrailSystem = new ParticleTrailSystem(scene);

// 粒子生成控制变量
let particleSpawnTimer = 0;
const particleSpawnInterval = 0.02; // 每0.02秒生成一批粒子

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

// 生成四面体边的粒子轨迹
function generateTetrahedronParticleTrails(tetraMesh, isUpper, worldMatrix) {
    if (!tetraMesh || !tetraMesh.geometry) return;
    
    const positionAttr = tetraMesh.geometry.getAttribute('position');
    const localPositions = positionAttr.array;
    
    // 获取四面体的边
    const edges = getTetrahedronEdges(localPositions);
    
    for (const edge of edges) {
        // 将局部坐标转换为世界坐标
        const worldStart = edge.start.clone().applyMatrix4(worldMatrix);
        const worldEnd = edge.end.clone().applyMatrix4(worldMatrix);
        
        // 计算边与地面的交点
        const intersection = calculateEdgeGroundIntersection(worldStart, worldEnd);
        
        // 只有当边与地面相交时才生成粒子
        if (intersection) {
            // 计算边与地面的夹角
            const angle = calculateAngleWithGround(worldStart, worldEnd);
            
            // 计算粒子颜色和生命周期
            const color = getParticleColorByAngle(angle, isUpper);
            const lifetime = 2.0 + (angle / (Math.PI / 2)) * 3.0; // 夹角越大，粒子存活越久
            
            // 在交点位置生成粒子
            // 添加一点随机偏移使轨迹更自然
            const particlePos = intersection.clone();
            particlePos.x += (Math.random() - 0.5) * 0.03;
            particlePos.z += (Math.random() - 0.5) * 0.03;
            
            particleTrailSystem.createParticle(particlePos, color, lifetime);
        }
    }
}



// 控制模式：'camera' 相机控制，'object' 物体控制
// 默认相机控制，按住 Ctrl 切换到物体控制
let controlMode = 'camera';
const controlModeDisplay = document.getElementById('controlModeDisplay');

// 更新控制模式显示
function updateControlModeDisplay() {
    controlModeDisplay.textContent = controlMode === 'camera' ? '相机控制' : '物体控制';
}

// Ctrl 键控制模式切换
window.addEventListener('keydown', (e) => {
    if (e.key === 'Control' && controlMode === 'camera') {
        controlMode = 'object';
        controls.enabled = false;
        updateControlModeDisplay();
    }
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'Control' && controlMode === 'object') {
        controlMode = 'camera';
        controls.enabled = true;
        updateControlModeDisplay();
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

    previousMousePosition = {
        x: event.clientX,
        y: event.clientY
    };
});

renderer.domElement.addEventListener('mouseup', (event) => {
    // 只响应左键释放
    if (event.button === 0) {
        isDragging = false;
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

    previousMousePosition = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY
    };
});

renderer.domElement.addEventListener('touchend', () => {
    isDragging = false;
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
let rotationSpeed = 0.01;
let isRotating = true; // 是否正在旋转
const speedSlider = document.getElementById('rotationSpeed');
const speedValue = document.getElementById('speedValue');

speedSlider.addEventListener('input', (e) => {
    rotationSpeed = parseFloat(e.target.value);
    speedValue.textContent = rotationSpeed.toFixed(2);
});

// 空格键控制旋转暂停/继续
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault(); // 防止页面滚动
        isRotating = !isRotating;
    }
});

function rotateMkb(mkb) {
    if (!isRotating) return; // 如果暂停旋转，直接返回

    const upperTetra = mkb.children[0];
    const lowerTetra = mkb.children[1];

    // 使用梅尔卡巴的中轴（对角线）作为旋转轴
    const axis = new THREE.Vector3(1, 1, 1).normalize();

    const quaternion = new THREE.Quaternion();

    // 上四面体顺时针旋转
    quaternion.setFromAxisAngle(axis, rotationSpeed * 1);
    upperTetra.quaternion.multiplyQuaternions(quaternion, upperTetra.quaternion);

    // 下四面体逆时针旋转
    quaternion.setFromAxisAngle(axis, -rotationSpeed * 3);
    lowerTetra.quaternion.multiplyQuaternions(quaternion, lowerTetra.quaternion);

    // 强制更新边和法线
    mkb.traverse(child => {
        if (child.isMesh) {
            child.geometry.computeVertexNormals(); // 更新法线
        }
    });
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // rotateMkb(merkaba);
    rotateMkb(merkaba2);
    
    // 更新粒子系统
    particleTrailSystem.update(0.016);
    
    // 定时生成粒子轨迹
    particleSpawnTimer += 0.016;
    if (particleSpawnTimer >= particleSpawnInterval) {
        particleSpawnTimer = 0;
        
        // 获取上四面体和下四面体
        const upperTetra = merkaba2.children[0];
        const lowerTetra = merkaba2.children[1];
        
        // 计算世界变换矩阵（需要考虑cubeGroup和四面体自身的变换）
        upperTetra.updateMatrixWorld(true);
        lowerTetra.updateMatrixWorld(true);
        
        const upperWorldMatrix = new THREE.Matrix4();
        const lowerWorldMatrix = new THREE.Matrix4();
        
        upperWorldMatrix.copy(upperTetra.matrixWorld);
        lowerWorldMatrix.copy(lowerTetra.matrixWorld);
        
        // 生成粒子轨迹
        generateTetrahedronParticleTrails(upperTetra, true, upperWorldMatrix);
        generateTetrahedronParticleTrails(lowerTetra, false, lowerWorldMatrix);
    }
    
    renderer.render(scene, camera);

    // outlineEffect.render(scene, camera);
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
});

animate();