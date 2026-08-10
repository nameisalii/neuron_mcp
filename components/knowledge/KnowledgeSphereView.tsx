'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { ArrowDownToLine, ArrowUpFromLine, X } from 'lucide-react'
import type { KnowledgeGraphData, KnowledgeGraphNode } from '@/lib/knowledge/graph'

export default function KnowledgeSphereView({ graph }: { graph: KnowledgeGraphData }) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const travelRef = useRef<number | null>(null)
  const [selected, setSelected] = useState<KnowledgeGraphNode | null>(null)
  const [depth, setDepth] = useState(26)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x050a16, 0.018)
    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200)
    camera.position.set(0, 3, 26)
    cameraRef.current = camera
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none'
    mount.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.enablePan = false
    controls.minDistance = 2.2
    controls.maxDistance = 32
    controls.rotateSpeed = 0.55
    controls.zoomSpeed = 0.8

    const radius = 10
    const gold = Math.PI * (3 - Math.sqrt(5))
    const shellPoints = Array.from({ length: 260 }, (_, index) => {
      const y = 1 - (index / 259) * 2
      const radial = Math.sqrt(Math.max(0, 1 - y * y))
      return new THREE.Vector3(Math.cos(gold * index) * radial, y, Math.sin(gold * index) * radial).multiplyScalar(radius)
    })
    const dotCanvas = document.createElement('canvas')
    dotCanvas.width = dotCanvas.height = 64
    const dotContext = dotCanvas.getContext('2d')!
    const gradient = dotContext.createRadialGradient(32, 32, 0, 32, 32, 32)
    gradient.addColorStop(0, '#ffffff')
    gradient.addColorStop(0.3, 'rgba(180,210,255,.8)')
    gradient.addColorStop(1, 'rgba(90,140,255,0)')
    dotContext.fillStyle = gradient
    dotContext.fillRect(0, 0, 64, 64)
    const dotTexture = new THREE.CanvasTexture(dotCanvas)
    const shell = new THREE.Group()
    shell.add(new THREE.Points(
      new THREE.BufferGeometry().setFromPoints(shellPoints),
      new THREE.PointsMaterial({ size: 0.42, map: dotTexture, transparent: true, opacity: 0.82, depthWrite: false, blending: THREE.AdditiveBlending, color: 0x9fb4d8 }),
    ))
    const shellLines: THREE.Vector3[] = []
    shellPoints.forEach((point, index) => {
      for (const offset of [1, 2]) {
        const other = shellPoints[(index + offset) % shellPoints.length]
        if (point.distanceTo(other) < 3.2) shellLines.push(point, other)
      }
    })
    shell.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(shellLines),
      new THREE.LineBasicMaterial({ color: 0x53688f, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending }),
    ))
    scene.add(shell)

    const core = new THREE.Group()
    const nodeMeshes: THREE.Sprite[] = []
    const positions = new Map<string, THREE.Vector3>()
    graph.nodes.forEach((node, index) => {
      const y = graph.nodes.length === 1 ? 0 : 1 - (index / (graph.nodes.length - 1)) * 2
      const radial = Math.sqrt(Math.max(0.06, 1 - y * y))
      const distance = 2.1 + ((index * 37) % 28) / 10
      const position = new THREE.Vector3(Math.cos(gold * index) * radial * distance, y * 4.2, Math.sin(gold * index) * radial * distance)
      positions.set(node.id, position)
      const canvas = document.createElement('canvas')
      canvas.width = 512
      canvas.height = 280
      const context = canvas.getContext('2d')!
      context.fillStyle = 'rgba(8,15,32,.95)'
      context.beginPath()
      context.roundRect(8, 8, 496, 264, 32)
      context.fill()
      context.strokeStyle = node.color
      context.lineWidth = 6
      context.stroke()
      context.fillStyle = node.color
      context.beginPath()
      context.arc(76, 82, 38, 0, Math.PI * 2)
      context.fill()
      context.fillStyle = '#07101f'
      context.font = 'bold 40px sans-serif'
      context.textAlign = 'center'
      context.fillText(node.label[0]?.toUpperCase() ?? '?', 76, 96)
      context.textAlign = 'left'
      context.fillStyle = '#f8fafc'
      context.font = 'bold 34px sans-serif'
      context.fillText(node.label.slice(0, 21), 130, 84)
      context.fillStyle = '#94a3b8'
      context.font = '22px monospace'
      context.fillText(`${node.kind.toUpperCase()} · ${node.knowledgeCount} ITEMS`, 38, 170)
      context.fillStyle = '#cbd5e1'
      context.font = '21px sans-serif'
      context.fillText(`${node.taskCount} tasks · ${node.decisionCount} decisions`, 38, 220)
      const material = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false, opacity: 0.96 })
      const sprite = new THREE.Sprite(material)
      sprite.position.copy(position)
      sprite.scale.set(2.9 * node.size, 1.58 * node.size, 1)
      sprite.userData = { node, home: position.clone(), phase: index * 0.83 }
      nodeMeshes.push(sprite)
      core.add(sprite)
    })

    const edgePositions: number[] = []
    const edgeColors: number[] = []
    graph.edges.forEach(edge => {
      const from = positions.get(edge.from)
      const to = positions.get(edge.to)
      if (!from || !to) return
      edgePositions.push(from.x, from.y, from.z, to.x, to.y, to.z)
      const brightness = Math.min(1, 0.32 + edge.weight / 7)
      edgeColors.push(0.2 * brightness, 0.45 * brightness, brightness, 0.2 * brightness, 0.45 * brightness, brightness)
    })
    const edgeGeometry = new THREE.BufferGeometry()
    edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3))
    edgeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(edgeColors, 3))
    core.add(new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending })))

    const pulses = graph.edges.slice(0, 90).flatMap((edge, index) => {
      const from = positions.get(edge.from)
      const to = positions.get(edge.to)
      return from && to ? [{ from, to, progress: (index * 0.37) % 1, speed: 0.08 + Math.min(edge.relatedCount, 12) * 0.012 }] : []
    })
    const pulseGeometry = new THREE.BufferGeometry()
    pulseGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(pulses.length * 3), 3))
    const pulsePoints = new THREE.Points(pulseGeometry, new THREE.PointsMaterial({ size: 0.28, map: dotTexture, color: 0x6c9cff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
    core.add(pulsePoints)
    scene.add(core)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2(2, 2)
    let pointerDown: { x: number; y: number } | null = null
    const updatePointer = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect()
      pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1)
    }
    const onPointerDown = (event: PointerEvent) => { pointerDown = { x: event.clientX, y: event.clientY }; updatePointer(event) }
    const onPointerMove = (event: PointerEvent) => updatePointer(event)
    const onPointerUp = (event: PointerEvent) => {
      if (!pointerDown || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 6) return
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(nodeMeshes, false)[0]?.object as THREE.Sprite | undefined
      setSelected(hit?.userData.node ?? null)
      pointerDown = null
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', onPointerUp)

    const resize = () => {
      const width = mount.clientWidth
      const height = mount.clientHeight
      if (!width || !height) return
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()
    const clock = new THREE.Clock()
    let frame = 0
    let lastDepthUpdate = 0
    const animate = () => {
      frame = requestAnimationFrame(animate)
      const elapsed = clock.getElapsedTime()
      const delta = Math.min(0.05, clock.getDelta() + 0.0001)
      if (travelRef.current !== null) {
        const direction = camera.position.clone().normalize()
        const next = THREE.MathUtils.lerp(camera.position.length(), travelRef.current, 0.075)
        camera.position.copy(direction.multiplyScalar(next))
        if (Math.abs(next - travelRef.current) < 0.06) travelRef.current = null
      }
      controls.update()
      shell.rotation.y += delta * 0.035
      core.rotation.y -= delta * 0.012
      nodeMeshes.forEach(sprite => { sprite.position.y = sprite.userData.home.y + Math.sin(elapsed * 0.55 + sprite.userData.phase) * 0.13 })
      const pulseArray = pulseGeometry.attributes.position.array as Float32Array
      pulses.forEach((pulse, index) => {
        pulse.progress = (pulse.progress + delta * pulse.speed) % 1
        const value = pulse.from.clone().lerp(pulse.to, pulse.progress)
        pulseArray.set([value.x, value.y, value.z], index * 3)
      })
      pulseGeometry.attributes.position.needsUpdate = true
      if (elapsed - lastDepthUpdate > 0.2) { lastDepthUpdate = elapsed; setDepth(camera.position.length()) }
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      scene.traverse(object => {
        const renderable = object as THREE.Mesh
        renderable.geometry?.dispose()
        const materials = Array.isArray(renderable.material) ? renderable.material : renderable.material ? [renderable.material] : []
        materials.forEach(material => {
          const map = (material as THREE.SpriteMaterial).map
          map?.dispose()
          material.dispose()
        })
      })
      dotTexture.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
      cameraRef.current = null
    }
  }, [graph])

  const connections = selected ? graph.edges.filter(edge => edge.from === selected.id || edge.to === selected.id) : []
  const viewItemsHref = selected?.kind === 'entity'
    ? `/dashboard/knowledge?search=${encodeURIComponent(selected.label)}`
    : `/dashboard/knowledge?source=${encodeURIComponent(selected?.source ?? selected?.label ?? '')}`
  const askHref = `/dashboard/query?q=${encodeURIComponent(`What do we know about ${selected?.label ?? ''}?`)}`

  return (
    <section aria-label="3D Knowledge Map" className="overflow-hidden rounded-2xl border border-slate-700 bg-[#050a16] text-slate-100 shadow-xl">
      <div className="relative h-[calc(100dvh-11rem)] min-h-[620px]">
        <div ref={mountRef} data-testid="knowledge-sphere-canvas" className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,#15264e_0%,#071022_45%,#03060f_100%)]" />
        {graph.nodes.length === 0 && <div className="pointer-events-none absolute bottom-5 left-1/2 z-10 -translate-x-1/2 rounded-full border border-slate-700/80 bg-slate-950/80 px-4 py-2 text-center text-xs text-slate-400 backdrop-blur">No mapped nodes yet · the sphere remains available for exploration</div>}
        <div className="pointer-events-none absolute left-4 top-4 rounded-lg border border-slate-700/70 bg-slate-950/70 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">
          {depth > 13 ? 'Outside the mesh' : depth > 7 ? 'Crossing the surface' : 'Inside the mesh'} · orbit {depth.toFixed(1)}
        </div>
        <div className="pointer-events-none absolute right-4 top-4 rounded-lg border border-slate-700/70 bg-slate-950/70 px-3 py-2 text-right text-xs text-slate-400">
          <span className="font-semibold text-slate-100">{graph.stats.totalKnowledge.toLocaleString()}</span> knowledge · {graph.stats.totalSources} sources · {graph.stats.totalEdges} connections
        </div>
        <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
          {graph.nodes.slice(0, 8).map(node => <button key={node.id} type="button" onClick={() => setSelected(node)} className="rounded-full border border-slate-700 bg-slate-950/75 px-3 py-1.5 text-xs text-slate-300 hover:border-blue-500"><span className="mr-2 inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: node.color }} />{node.label}</button>)}
        </div>
        <div className="absolute bottom-4 right-4 flex gap-2">
          <button type="button" onClick={() => { travelRef.current = 4.5 }} className="inline-flex items-center gap-1 rounded-full border border-blue-500/60 bg-slate-950/80 px-3 py-2 text-xs"><ArrowDownToLine className="h-3.5 w-3.5" />Dive in</button>
          <button type="button" onClick={() => { travelRef.current = 26; setSelected(null) }} className="inline-flex items-center gap-1 rounded-full border border-slate-600 bg-slate-950/80 px-3 py-2 text-xs"><ArrowUpFromLine className="h-3.5 w-3.5" />Surface</button>
        </div>
        {selected && <aside className="absolute inset-y-4 right-4 z-10 w-[min(360px,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950/95 p-5 shadow-2xl backdrop-blur">
          <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{selected.kind} · {selected.sourceType}</p><h3 className="mt-1 text-xl font-semibold">{selected.label}</h3></div><button type="button" aria-label="Close details" onClick={() => setSelected(null)} className="rounded-full border border-slate-700 p-1.5 text-slate-400"><X className="h-4 w-4" /></button></div>
          <p className="mt-4 text-sm leading-6 text-slate-300">{selected.summary}</p>
          <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-slate-800 bg-slate-800 text-center"><Stat label="Knowledge" value={selected.knowledgeCount} /><Stat label="Tasks" value={selected.taskCount} /><Stat label="Decisions" value={selected.decisionCount} /></div>
          <p className="mt-4 text-xs text-slate-400">Size is based on {selected.knowledgeCount} knowledge {selected.knowledgeCount === 1 ? 'item' : 'items'}. {connections.length} visible connections represent {connections.reduce((sum, edge) => sum + edge.relatedCount, 0)} related signals.</p>
          {connections.slice(0, 3).map(edge => <p key={edge.id} className="mt-2 rounded-lg bg-slate-900 p-2 text-xs text-slate-400">Connected to {graph.nodes.find(node => node.id === (edge.from === selected.id ? edge.to : edge.from))?.label}: {edge.relatedCount} {edge.reason}.</p>)}
          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Top knowledge</h4>
          <div className="mt-2 space-y-2">{selected.topItems.map(item => <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3"><p className="text-sm font-medium">{item.title}</p><p className="mt-1 line-clamp-2 text-xs text-slate-400">{item.summary || 'No summary available.'}</p></div>)}</div>
          <div className="mt-5 grid grid-cols-2 gap-2"><Link href={viewItemsHref} className="rounded-lg border border-slate-700 px-3 py-2 text-center text-xs font-medium">View items</Link><Link href={askHref} className="rounded-lg bg-blue-600 px-3 py-2 text-center text-xs font-medium text-white">Ask about this</Link></div>
        </aside>}
      </div>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="bg-slate-950 p-3"><p className="text-lg font-semibold">{value}</p><p className="text-[10px] uppercase text-slate-500">{label}</p></div>
}
