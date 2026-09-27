'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lightning from './Lightning';

const MODEL_URL =
  'https://res.cloudinary.com/df6tfgugw/raw/upload/v1790497894/titan_logo_3d_xldzso.obj';

// The logo's largest side, in world units. The camera sits at z=180 with a 45° FOV,
// so the visible height at z=0 is ~149 units — 56 makes the logo ~38% of the screen height.
const LOGO_SIZE = 56;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Content — edit these arrays to change the copy without touching the animation.
// ---------------------------------------------------------------------------

const STEPS = [
  {
    className: 'bp-1',
    title: 'Companies post contracts.',
    body: 'Every brief is scoped, budgeted and signed with Titan before it goes live.',
  },
  {
    className: 'bp-2',
    title: 'You apply to Titan.',
    body: 'Pick the contracts that fit your skills. We handle the matching and the paperwork.',
  },
  {
    className: 'bp-3',
    title: 'You do the work.',
    body: 'Clear brief, clear deadline, one point of contact. No bidding wars.',
  },
  {
    className: 'bp-4',
    title: 'You get paid.',
    body: 'Titan invoices the company. Titan pays you. Nobody chases anybody.',
  },
];

// Horizontal "method" section — replace with your own features.
const FEATURES = [
  {
    letter: 'S',
    title: 'Source',
    body: 'We bring contract work in from partner companies — real projects with real budgets, signed before they reach you.',
    tag: 'Companies → Titan',
  },
  {
    letter: 'C',
    title: 'Check',
    body: 'Every freelancer is vetted once. Skills, samples and a short trial task — then you never re-apply.',
    tag: 'Freelancers → Titan',
  },
  {
    letter: 'A',
    title: 'Assign',
    body: 'Contracts are matched to people, not auctioned. The right skills get the right brief.',
    tag: 'Titan → Freelancers',
  },
  {
    letter: 'V',
    title: 'Verify',
    body: 'Deliverables are reviewed against the brief before they ship, so companies get what they signed for.',
    tag: 'Quality layer',
  },
  {
    letter: 'P',
    title: 'Pay',
    body: 'Titan invoices the company and pays you directly. One contract, one payer, no chasing invoices.',
    tag: 'Titan → You',
  },
];

// ---------------------------------------------------------------------------
// Flight path. Each state is reached as its trigger section scrolls from the
// bottom of the screen to the top. Rotations are in turns (1 = 360°); a y of
// n.25 / n.75 is edge-on, so resting states stay near whole or half turns.
// ---------------------------------------------------------------------------

const FLIGHT = [
  { at: null, pos: [48, -2, 0], rot: [0.03, -0.1, 0.02] },
  { at: '.s-companies', pos: [-60, 4, -6], rot: [-0.06, 0.6, -0.05] },
  { at: '.s-talent', pos: [52, -6, -10], rot: [0.08, 1.1, 0.06] },
  { at: '.s-layer', pos: [-50, 0, 24], rot: [-0.05, 1.4, -0.08] },
  { at: '.s-apply', pos: [54, 4, 0], rot: [0.1, 1.9, 0.04] },
  { at: '.bp-intro', pos: [46, 0, 30], rot: [0, 2, 0] },
  { at: '.bp-1', pos: [48, -2, 10], rot: [0.09, 2.1, 0.02] },
  { at: '.bp-2', pos: [48, 2, 10], rot: [-0.08, 2.38, 0.05] },
  { at: '.bp-3', pos: [48, 0, 10], rot: [0.05, 2.55, 0.12] },
  { at: '.bp-4', pos: [46, 0, 30], rot: [0, 3, 0] },
  { at: '.features', pos: [150, 84, -160], rot: [0.06, 3.1, 0] },
  { at: '.s-end', pos: [0, 32, -20], rot: [0.04, 4.93, -0.02] },
];

const toState = ({ pos, rot }) => ({
  pos: { x: pos[0], y: pos[1], z: pos[2] },
  rot: { x: rot[0] * TAU, y: rot[1] * TAU, z: rot[2] * TAU },
});

// ---------------------------------------------------------------------------
// Three.js scene. Two cameras share one scene: layer 0 is the solid logo,
// layer 1 its wireframe. The wireframe view is scissored in over the blueprint.
// ---------------------------------------------------------------------------

class Scene {
  constructor(geometry) {
    this.views = [
      { bottom: 0, height: 1 },
      { bottom: 0, height: 0 },
    ];

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.className = 'titan-canvas';
    document.body.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.views.forEach((view, ii) => {
      const camera = new THREE.PerspectiveCamera(45, 1, 1, 2000);
      camera.position.set(0, 0, 180);
      camera.layers.disableAll();
      camera.layers.enable(ii);
      camera.lookAt(0, 0, 0);
      view.camera = camera;
    });

    this.light = new THREE.PointLight(0xffffff, 0.9);
    this.light.position.set(70, 20, 150);
    this.scene.add(this.light);

    const rim = new THREE.DirectionalLight(0x9fb4ff, 0.6);
    rim.position.set(-80, 60, -40);
    this.scene.add(rim);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));

    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshPhongMaterial({
        color: 0x2d55d6,
        specular: 0xdfe6ff,
        shininess: 40,
        flatShading: true,
      })
    );
    mesh.layers.set(0);

    const line = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 20),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthTest: false })
    );
    line.layers.set(1);

    // stage  — scaled on resize so the layout keeps its proportions on narrow screens
    // flight — driven by scroll
    // hover  — pointer tilt + idle float
    // spin   — intro spin and the spin through the horizontal section
    this.stage = new THREE.Group();
    this.flight = new THREE.Group();
    this.hover = new THREE.Group();
    this.spin = new THREE.Group();
    this.spin.add(mesh, line);
    this.hover.add(this.spin);
    this.flight.add(this.hover);
    this.stage.add(this.flight);
    this.scene.add(this.stage);

    this.onResize();
    window.addEventListener('resize', this.onResize);
  }

  render = () => {
    const { renderer } = this;
    renderer.setViewport(0, 0, this.w, this.h);
    renderer.setScissorTest(true);
    for (const view of this.views) {
      const height = Math.floor(this.h * view.height);
      if (height <= 0) continue;
      renderer.setScissor(0, Math.floor(this.h * view.bottom), this.w, height);
      renderer.render(this.scene, view.camera);
    }
  };

  onResize = () => {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    const aspect = this.w / this.h;

    for (const view of this.views) {
      view.camera.aspect = aspect;
      view.camera.updateProjectionMatrix();
    }

    // Positions are authored for a ~16:9 screen; shrink everything on narrower ones.
    const s = Math.max(0.42, Math.min(1, aspect / 1.6));
    this.stage.scale.setScalar(s);

    this.renderer.setSize(this.w, this.h);
    this.render();
  };

  dispose() {
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

// The raw OBJ has its origin at a corner (x 0→60, y 0→55), so rotations swung it
// around that corner. Center it and scale it to a known size.
function normalizeGeometry(geometry) {
  geometry.center();
  geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  geometry.boundingBox.getSize(size);
  const s = LOGO_SIZE / Math.max(size.x, size.y, size.z);
  geometry.scale(s, s, s);
  geometry.computeVertexNormals();
  return geometry;
}

function fallbackGeometry() {
  const t = new THREE.Shape();
  t.moveTo(0, 60);
  t.lineTo(60, 60);
  t.lineTo(60, 46);
  t.lineTo(37, 46);
  t.lineTo(37, 0);
  t.lineTo(23, 0);
  t.lineTo(23, 46);
  t.lineTo(0, 46);
  t.closePath();
  return new THREE.ExtrudeGeometry(t, { depth: 8, bevelEnabled: false });
}

export default function TitanScrollScene() {
  const rootRef = useRef(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger, SplitText);

    let scene = null;
    let mm = null;
    let cancelled = false;
    const root = rootRef.current;
    const ctx = gsap.context(() => {}, root);

    // ---- Everything that doesn't need the model --------------------------------

    ctx.add(() => {
      // Horizontal section. Created first so every trigger below it accounts for the pin spacer.
      const track = root.querySelector('.features-track');
      const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);

      const horizontal = gsap.to(track, {
        x: () => -distance(),
        ease: 'none',
        scrollTrigger: {
          trigger: '.features',
          start: 'top top',
          end: () => '+=' + distance(),
          pin: true,
          scrub: 1,
          invalidateOnRefresh: true,
          anticipatePin: 1,
          onUpdate: (self) => gsap.set('.features-progress-bar', { scaleX: self.progress }),
        },
      });

      gsap.utils.toArray('.feature-card').forEach((card) => {
        const st = { trigger: card, containerAnimation: horizontal, scrub: true };
        gsap.from(card, {
          rotateY: -18,
          yPercent: 12,
          opacity: 0.2,
          ease: 'none',
          scrollTrigger: { ...st, start: 'left 100%', end: 'left 55%' },
        });
        gsap.from(card.querySelector('.feature-letter'), {
          xPercent: 60,
          opacity: 0,
          ease: 'none',
          scrollTrigger: { ...st, start: 'left 90%', end: 'left 35%' },
        });
      });

      gsap.to('.page-progress', {
        scaleX: 1,
        ease: 'none',
        scrollTrigger: { trigger: root, start: 'top top', end: 'bottom bottom', scrub: 0.3 },
      });

      // The storm behind the hero drifts up and dims as the hero scrolls away.
      gsap.to('.hero-storm', {
        yPercent: -18,
        autoAlpha: 0.15,
        ease: 'none',
        scrollTrigger: { trigger: '.hero-wrap', scrub: true, start: 'top top', end: 'bottom top' },
      });

      // Parallax on the sky/ground gradient and clouds.
      gsap.to('.ground', {
        yPercent: 12,
        ease: 'none',
        scrollTrigger: { trigger: '.ground-container', scrub: true, start: 'top bottom', end: 'bottom top' },
      });
      gsap.from('.clouds', {
        yPercent: 25,
        ease: 'none',
        scrollTrigger: { trigger: '.ground-container', scrub: true, start: 'top bottom', end: 'bottom top' },
      });

      // Guide overlay is fixed-position, so only show it while the blueprint is on screen.
      ScrollTrigger.create({
        trigger: '.blueprint',
        start: 'top 50%',
        end: 'bottom 50%',
        onToggle: (self) => gsap.to('.blueprint svg', { autoAlpha: self.isActive ? 1 : 0, duration: 0.3 }),
      });

      // Blueprint guide lines draw in with their step and fade as it leaves.
      gsap.utils.toArray('.guide').forEach((guide, i) => {
        const step = `.bp-${i + 1}`;
        gsap.fromTo(
          guide,
          { strokeDashoffset: 1, opacity: 1 },
          {
            strokeDashoffset: 0,
            ease: 'none',
            scrollTrigger: { trigger: step, scrub: true, start: 'top 80%', end: 'top 20%' },
          }
        );
        gsap.to(guide, {
          opacity: 0,
          ease: 'none',
          immediateRender: false,
          scrollTrigger: { trigger: step, scrub: true, start: 'bottom 60%', end: 'bottom 20%' },
        });
      });
    });

    // Split text once webfonts are in, otherwise line breaks are measured with the fallback font.
    document.fonts.ready.then(() => {
      if (cancelled) return;
      ctx.add(() => {
        const hero = SplitText.create('.hero h1', { type: 'words,chars', mask: 'chars' });
        gsap.from(hero.chars, {
          yPercent: 110,
          duration: 1.1,
          stagger: 0.035,
          ease: 'expo.out',
          delay: 0.4,
        });
        gsap.from('.hero .reveal-up', {
          y: 30,
          autoAlpha: 0,
          duration: 1,
          stagger: 0.12,
          ease: 'power3.out',
          delay: 0.9,
        });

        gsap.utils.toArray('.section:not(.hero) h2').forEach((h2) => {
          const split = SplitText.create(h2, { type: 'lines,words', mask: 'lines' });
          gsap.from(split.words, {
            yPercent: 110,
            duration: 0.9,
            stagger: 0.04,
            ease: 'expo.out',
            scrollTrigger: { trigger: h2, start: 'top 85%', toggleActions: 'play none none reverse' },
          });
        });

        gsap.utils.toArray('.section:not(.hero) p, .section:not(.hero) .step-index, .cta-row').forEach((el) => {
          gsap.from(el, {
            y: 24,
            autoAlpha: 0,
            duration: 0.9,
            ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 90%', toggleActions: 'play none none reverse' },
          });
        });

        ScrollTrigger.refresh();
      });
    });

    // ---- The 3D logo --------------------------------------------------------------

    function setupScene(geometry) {
      scene = new Scene(normalizeGeometry(geometry));
      const { stage, flight, hover, spin, views } = scene;

      ctx.add(() => {
        gsap.ticker.add(scene.render);

        gsap.to('.loading', { autoAlpha: 0, duration: 0.6, delay: 0.2 });
        gsap.to('.scroll-cta', { autoAlpha: 1, delay: 1.6 });
        gsap.fromTo(scene.renderer.domElement, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8 });

        // Intro: the logo spins in from the right.
        gsap.from(spin.rotation, { y: -TAU * 1.25, x: 0.6, duration: 2.4, ease: 'expo.out' });
        gsap.from(spin.position, { x: 140, z: -120, duration: 2.2, ease: 'expo.out' });
        gsap.from(spin.scale, { x: 0.3, y: 0.3, z: 0.3, duration: 2, ease: 'expo.out' });

        // Idle float, so the logo never looks frozen between scroll steps.
        gsap.to(hover.position, { y: 2.5, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1 });

        // Scroll flight: one scrubbed tween per step, each from the previous state to the next.
        const states = FLIGHT.map(toState);
        gsap.set(flight.position, states[0].pos);
        gsap.set(flight.rotation, states[0].rot);

        FLIGHT.forEach((step, i) => {
          if (!step.at) return;
          const scrollTrigger = { trigger: step.at, start: 'top bottom', end: 'top top', scrub: 1 };
          const defaults = { ease: 'power2.inOut', immediateRender: false };
          gsap.fromTo(flight.position, states[i - 1].pos, { ...states[i].pos, ...defaults, scrollTrigger });
          gsap.fromTo(flight.rotation, states[i - 1].rot, { ...states[i].rot, ...defaults, scrollTrigger });
        });

        // Slow full spin while the features scroll sideways.
        gsap.fromTo(
          spin.rotation,
          { y: 0 },
          {
            y: TAU * 2,
            ease: 'none',
            immediateRender: false,
            scrollTrigger: {
              trigger: '.features',
              start: 'top top',
              end: () => '+=' + Math.max(0, root.querySelector('.features-track').scrollWidth - window.innerWidth),
              scrub: 1,
            },
          }
        );

        // Portrait screens: text sits in the top half, so park the logo in the bottom half,
        // then lift it above the heading for the finale (whose text is bottom-aligned).
        mm = gsap.matchMedia();
        mm.add('(max-aspect-ratio: 1/1)', () => {
          gsap.set(stage.position, { y: -38 });
          gsap.to(stage.position, {
            y: 24,
            ease: 'power2.inOut',
            scrollTrigger: { trigger: '.s-end', start: 'top bottom', end: 'top top', scrub: 1 },
          });
          return () => gsap.set(stage.position, { y: 0 });
        });

        // Wireframe view wipes in with the blueprint and out as it leaves.
        gsap.fromTo(
          views[1],
          { height: 0, bottom: 0 },
          {
            height: 1,
            bottom: 0,
            ease: 'none',
            scrollTrigger: { trigger: '.blueprint', scrub: true, start: 'top bottom', end: 'top top' },
          }
        );
        gsap.fromTo(
          views[1],
          { height: 1, bottom: 0 },
          {
            height: 0,
            bottom: 1,
            ease: 'none',
            immediateRender: false,
            scrollTrigger: { trigger: '.blueprint', scrub: true, start: 'bottom bottom', end: 'bottom top' },
          }
        );

        // Pointer tilt (mouse only).
        if (window.matchMedia('(pointer: fine)').matches) {
          const tiltX = gsap.quickTo(hover.rotation, 'x', { duration: 1.2, ease: 'power3.out' });
          const tiltY = gsap.quickTo(hover.rotation, 'y', { duration: 1.2, ease: 'power3.out' });
          const onMove = (e) => {
            tiltY(((e.clientX / window.innerWidth) - 0.5) * 0.5);
            tiltX(((e.clientY / window.innerHeight) - 0.5) * 0.35);
          };
          window.addEventListener('pointermove', onMove);
          return () => window.removeEventListener('pointermove', onMove);
        }
      });

      ScrollTrigger.refresh();
    }

    new OBJLoader().load(
      MODEL_URL,
      (obj) => {
        if (cancelled) return;
        let mesh = null;
        obj.traverse((child) => {
          if (child.isMesh && !mesh) mesh = child;
        });
        setupScene(mesh ? mesh.geometry : fallbackGeometry());
      },
      undefined,
      (error) => {
        console.warn('Titan logo failed to load, using fallback', error);
        if (!cancelled) setupScene(fallbackGeometry());
      }
    );

    return () => {
      cancelled = true;
      if (scene) gsap.ticker.remove(scene.render);
      if (mm) mm.revert();
      ctx.revert();
      if (scene) scene.dispose();
    };
  }, []);

  return (
    <div className="content" ref={rootRef}>
      <div className="page-progress" />

      <header className="site-nav">
        <a className="brand" href="#top">
          Titan <em>Freelance</em>
        </a>
        <nav>
          <a href="#how">How it works</a>
          <a href="#method">Method</a>
          <a href="#apply">Apply</a>
        </nav>
      </header>

      <div className="loading">
        <span>Titan Freelance</span>
      </div>

      <div className="hero-wrap">
        {/* hue 230 ≈ Titan blue; the negative offset puts the bolt behind the logo on the right. */}
        <div className="hero-storm">
          <Lightning hue={228} xOffset={-0.55} speed={0.9} intensity={0.9} size={1.3} />
        </div>

        <div className="section hero" id="top">
          <p className="eyebrow reveal-up">Contract work, done right</p>
          <h1>Titan Freelance.</h1>
          <h3 className="reveal-up">The layer between companies and the people who do the work.</h3>
          <p className="lede reveal-up">
            Companies bring the contracts. You bring the skills. Titan handles everything in between.
          </p>
          <div className="scroll-cta">
            <span>Scroll</span>
            <i />
          </div>
        </div>
      </div>

      <div className="section right s-companies">
        <h2>Companies need work done…</h2>
        <p>Projects, sprints, backlogs — without another full-time hire.</p>
      </div>

      <div className="ground-container">
        <div className="parallax ground" />
        <div className="section s-talent">
          <h2>…and people want to do it.</h2>
          <p>Skilled freelancers looking for real contracts, not endless bidding wars.</p>
        </div>
        <div className="section right s-layer">
          <h2>Titan is the layer in between.</h2>
          <p>Companies sign with Titan. You sign with Titan. Everything else runs through us.</p>
        </div>
        <div className="section light s-apply">
          <h2>Apply once. Work everywhere.</h2>
          <p>One profile, one vetting — access to every contract on the platform.</p>
        </div>
        <div className="parallax clouds" />
      </div>

      <div className="blueprint" id="how">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path className="guide" pathLength="1" d="M55 80 L78 80 M55 77 L55 83 M78 77 L78 83" />
          <path className="guide" pathLength="1" d="M86 28 L86 72 M83 28 L89 28 M83 72 L89 72" />
          <path className="guide" pathLength="1" d="M48 50 L96 50 M66.5 12 L66.5 88" />
          <path className="guide" pathLength="1" d="M53 24 L80 24 L80 76 L53 76 Z" />
        </svg>

        <div className="section dark bp-intro">
          <p className="eyebrow">Under the hood</p>
          <h2>How it works.</h2>
          <p>From a company&apos;s brief to money in your account — four steps.</p>
        </div>

        {STEPS.map((step, i) => (
          <div className={`section dark ${step.className}`} key={step.className}>
            <span className="step-index">0{i + 1}</span>
            <h2>{step.title}</h2>
            <p>{step.body}</p>
          </div>
        ))}
      </div>

      <section className="features" id="method">
        <div className="features-track">
          <div className="features-intro">
            <p className="eyebrow">The Titan method</p>
            <h2 className="features-title">
              Five steps between a brief and your payout.
            </h2>
            <p className="features-hint">Keep scrolling →</p>
          </div>

          {FEATURES.map((f, i) => (
            <article className="feature-card" key={f.title}>
              <div className="feature-top">
                <span className="feature-index">0{i + 1}</span>
                <span className="feature-tag">{f.tag}</span>
              </div>
              <span className="feature-letter">{f.letter}</span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </article>
          ))}
        </div>
        <div className="features-progress">
          <div className="features-progress-bar" />
        </div>
      </section>

      <div className="sunset" id="apply">
        <div className="section end s-end">
          <h2>Your next contract is waiting.</h2>
          <p>Apply once. Work with companies you&apos;d never reach alone. Get paid by Titan.</p>
          <div className="cta-row">
            <a className="btn btn-primary" href="#apply">
              Apply as a freelancer
            </a>
            <a className="btn btn-ghost" href="#apply">
              Hire through Titan
            </a>
          </div>
          <ul className="credits">
            <li>Titan Freelance — inspired by Titan, run on Titan.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
