import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { createMerkaba } from './mkb';
import { OutlineEffect } from 'three/examples/jsm/Addons.js';
import { createBackground } from './bg';
// 场景设置
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a); // 深色背景

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('container').appendChild(renderer.domElement);

// 创建渐变背景
const gradientTexture = new THREE.CanvasTexture(createGradientCanvas());
gradientTexture.needsUpdate = true;
const backgroundGeometry = new THREE.PlaneGeometry(100, 100);
const backgroundMaterial = new THREE.MeshBasicMaterial({
    map: gradientTexture,
    side: THREE.DoubleSide
});
const background = new THREE.Mesh(backgroundGeometry, backgroundMaterial);
background.position.z = -10;
scene.add(background);

// 创建渐变背景画布
function createGradientCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');

    // 创建径向渐变
    const gradient = context.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, canvas.width / 2
    );
    gradient.addColorStop(0, '#1a1a1a');
    gradient.addColorStop(0.5, '#2a2a2a');
    gradient.addColorStop(1, '#1a1a1a');

    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas;
}

// 添加多层网格
function createGrids() {
    // // 主网格
    // const mainGrid = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
    // mainGrid.position.y = 0;
    // scene.add(mainGrid);

    // // 次网格（更细的线）
    // const subGrid = new THREE.GridHelper(20, 100, 0x333333, 0x111111);
    // subGrid.position.y = 0;
    // scene.add(subGrid);

    // 添加网格线发光效果
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

createGrids();

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
const xLabel = createTextSprite('X', '#ff0000', new THREE.Vector3(3, 0, 0));
const yLabel = createTextSprite('Y', '#00ff00', new THREE.Vector3(0, 3, 0));
const zLabel = createTextSprite('Z', '#0000ff', new THREE.Vector3(0, 0, 3));

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
controls.maxDistance = 10;
controls.maxPolarAngle = Math.PI / 2;
camera.position.set(5, 5, 5);
controls.update();

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
const merkaba = createMerkaba();
cubeGroup.add(merkaba);


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


scene.add(cubeGroup);



// 鼠标控制变量
let isDragging = false;
let previousMousePosition = {
    x: 0,
    y: 0
};

// 鼠标事件监听
renderer.domElement.addEventListener('mousedown', (event) => {
    // 只响应左键点击
    if (event.button === 0) {
        isDragging = true;
        controls.enabled = false; // 禁用相机控制
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
        controls.enabled = true; // 重新启用相机控制
    }
});

// 触摸事件支持
renderer.domElement.addEventListener('touchstart', (event) => {
    isDragging = true;
    controls.enabled = false; // 禁用相机控制
    previousMousePosition = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY
    };
});

renderer.domElement.addEventListener('touchmove', (event) => {
    if (!isDragging) return;

    const deltaMove = {
        x: event.touches[0].clientX - previousMousePosition.x,
        y: event.touches[0].clientY - previousMousePosition.y
    };

    // 按照世界坐标系旋转
    const worldRotationMatrix = new THREE.Matrix4();
    worldRotationMatrix.makeRotationY(deltaMove.x * 0.005);
    worldRotationMatrix.multiply(new THREE.Matrix4().makeRotationX(deltaMove.y * 0.005));

    // 应用世界坐标系旋转
    cubeGroup.matrix.multiply(worldRotationMatrix);
    cubeGroup.matrix.decompose(cubeGroup.position, cubeGroup.quaternion, cubeGroup.scale);

    previousMousePosition = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY
    };
});

renderer.domElement.addEventListener('touchend', () => {
    isDragging = false;
    controls.enabled = true; // 重新启用相机控制
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
let rotationSpeed = 0.78;
const speedSlider = document.getElementById('rotationSpeed');
const speedValue = document.getElementById('speedValue');

speedSlider.addEventListener('input', (e) => {
    rotationSpeed = parseFloat(e.target.value);
    speedValue.textContent = rotationSpeed.toFixed(2);
});

function animate() {
    requestAnimationFrame(animate);
    controls.update();

    const upperTetra = merkaba.children[0];
    const lowerTetra = merkaba.children[1];

    // 使用梅尔卡巴的中轴（对角线）作为旋转轴
    const axis = new THREE.Vector3(1, 1, 1).normalize();

    const quaternion = new THREE.Quaternion();

    // 上四面体顺时针旋转
    quaternion.setFromAxisAngle(axis, rotationSpeed * 2);
    upperTetra.quaternion.multiplyQuaternions(quaternion, upperTetra.quaternion);

    // 下四面体逆时针旋转
    quaternion.setFromAxisAngle(axis, -rotationSpeed * 2);
    lowerTetra.quaternion.multiplyQuaternions(quaternion, lowerTetra.quaternion);

    // 强制更新边和法线
    merkaba.traverse(child => {
        if (child.isMesh) {
            child.geometry.computeVertexNormals(); // 更新法线
        }
    });

    renderer.render(scene, camera);

    // outlineEffect.render(scene, camera);
}

// 窗口大小调整
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();