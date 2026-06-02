// src/js/ui/camera.js
import { showToast } from '../lib/toast.js'

let _camStream   = null
let _camFacing   = 'environment'
let _camCallback = null

export async function openCamera(callback) {
  _camCallback = callback
  const modal = document.getElementById('camera-modal')
  if (!modal) { showToast('Modal kamera tidak tersedia', 'error'); return }
  modal.classList.add('open')
  await startCameraStream()
}

async function startCameraStream() {
  if (_camStream) { _camStream.getTracks().forEach(t => t.stop()); _camStream = null }
  const video     = document.getElementById('cam-video')
  const modeLabel = document.getElementById('cam-mode-label')
  if (!video) { showToast('Elemen video tidak ditemukan', 'error'); return }
  try {
    _camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: _camFacing, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    })
    video.srcObject = _camStream
    await video.play().catch(() => {})
    if (modeLabel) modeLabel.textContent = _camFacing === 'environment' ? 'Kamera belakang aktif' : 'Kamera depan aktif'
  } catch (err) {
    closeCamera()
    if (err.name === 'NotAllowedError') showToast('Izin kamera ditolak — coba pilih dari galeri', 'error')
    else if (err.name === 'NotFoundError') showToast('Kamera tidak ditemukan', 'error')
    else showToast('Kamera tidak bisa diakses: ' + err.message, 'error')
  }
}

export function closeCamera() {
  if (_camStream) { _camStream.getTracks().forEach(t => t.stop()); _camStream = null }
  document.getElementById('camera-modal')?.classList.remove('open')
}

export async function flipCamera() {
  _camFacing = _camFacing === 'environment' ? 'user' : 'environment'
  await startCameraStream()
}

export function capturePhoto() {
  const video  = document.getElementById('cam-video')
  const canvas = document.getElementById('cam-canvas')
  if (!video || !video.videoWidth) { showToast('Kamera belum siap, tunggu sebentar', 'error'); return }
  if (!canvas) { showToast('Canvas tidak ditemukan', 'error'); return }

  // Flash effect
  const flash = document.getElementById('cam-flash')
  if (flash) { flash.style.opacity = '1'; setTimeout(() => { flash.style.opacity = '0' }, 150) }

  canvas.width  = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (_camFacing === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1) }
  ctx.drawImage(video, 0, 0)

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
  const base64  = dataUrl.split(',')[1]
  const cb = _camCallback
  closeCamera()
  _camCallback = null
  if (cb) cb(dataUrl, base64, 'image/jpeg')
}

export function openGallery() {
  // Trigger the gallery file input; keep callback alive
  const input = document.getElementById('gallery-input')
  if (!input) { showToast('Input galeri tidak ditemukan', 'error'); return }
  input.click()
}

export function handleGalleryFile(input) {
  const file = input.files && input.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = e => {
    const dataUrl = e.target.result
    const base64  = dataUrl.split(',')[1]
    const mime    = file.type || 'image/jpeg'
    const cb = _camCallback
    closeCamera()
    _camCallback = null
    if (cb) cb(dataUrl, base64, mime)
  }
  reader.readAsDataURL(file)
  input.value = ''
}

export function initCamera() {
  const modal = document.getElementById('camera-modal')
  if (!modal) return
  modal.innerHTML = `
    <div class="cam-topbar">
      <div>
        <div class="cam-title">📷 Foto Struk</div>
        <div class="cam-mode" id="cam-mode-label">Posisikan struk dalam frame</div>
      </div>
      <button onclick="closeCamera()" style="background:rgba(255,255,255,0.1);border:none;color:#fff;font-size:18px;cursor:pointer;width:36px;height:36px;border-radius:50%">✕</button>
    </div>
    <div class="cam-viewfinder">
      <video id="cam-video" autoplay playsinline muted></video>
      <canvas id="cam-canvas" style="display:none"></canvas>
      <div class="cam-overlay">
        <div class="cam-bracket tl"></div><div class="cam-bracket tr"></div>
        <div class="cam-bracket bl"></div><div class="cam-bracket br"></div>
        <div class="cam-scan-hint">Arahkan kamera ke struk</div>
        <div class="cam-scan-line"></div>
      </div>
      <div id="cam-flash" style="position:absolute;inset:0;background:#fff;opacity:0;transition:opacity .15s;pointer-events:none"></div>
    </div>
    <div class="cam-controls">
      <button class="cam-flip-btn" onclick="flipCamera()">🔄</button>
      <div class="cam-shutter" onclick="capturePhoto()"><div class="cam-shutter-inner"></div></div>
      <div style="width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:22px" onclick="openGallery()">🖼️</div>
    </div>
    <input type="file" id="gallery-input" accept="image/*" style="display:none"/>
  `

  // Setup gallery input handler
  const galleryInput = document.getElementById('gallery-input')
  if (galleryInput) {
    galleryInput.onchange = (e) => handleGalleryFile(e.target)
  }

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('camera-modal')?.classList.contains('open')) closeCamera()
  })

  // Expose to window for inline onclick
  window.openCamera    = openCamera
  window.flipCamera    = flipCamera
  window.capturePhoto  = capturePhoto
  window.closeCamera   = closeCamera
  window.openGallery   = openGallery
}
