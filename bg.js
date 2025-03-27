import * as THREE from 'three';
export function createBackground () {
    // 创建渐变画布
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 128, 0);
    gradient.addColorStop(0, '#222');
    gradient.addColorStop(1, '#555');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 1);

    // 创建纹理
    const gradientTexture = new THREE.CanvasTexture(canvas);
    gradientTexture.wrapS = THREE.RepeatWrapping;
    gradientTexture.wrapT = THREE.RepeatWrapping;
    gradientTexture.repeat.set(10, 10); // 控制重复次数

    // 创建背景平面
    const bgPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 10),
        new THREE.MeshBasicMaterial({
            map: gradientTexture,
            side: THREE.DoubleSide
        })
    );
    bgPlane.position.z = -5; // 确保在相机后方
    return bgPlane;
}
