import { useEffect, useRef } from 'react';
import RAPIER, { type RigidBody } from '@dimforge/rapier3d-compat';
import {
  AmbientLight,
  DirectionalLight,
  Euler,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  ShadowMaterial,
  Vector3,
  WebGLRenderer,
  PCFShadowMap,
} from 'three';
import {
  DICE_ANIMATION_TIMINGS,
  DICE_GUIDANCE,
  DICE_SETTLING_THRESHOLDS,
  advanceDiceAnimation,
  createCompletionGate,
  createDiceAnimationState,
  createSharedInitializer,
  earlyGuidanceStrength,
  finalGuidanceMaximumRate,
  guidanceAngularStep,
  resultEmphasisProgress,
  runVisualFrameFailOpen,
  settlingAssistStrength,
  shouldBeginSettlingAssist,
} from '../dice/diceAnimationState';
import { closestTargetQuaternionForFace, getDieDefinition } from '../dice/dieDefinitions';
import type { DiceVisualEvent } from '../dice/diceVisualEvent';
import { createVisualDieObject, type VisualDieObject } from '../dice/threeDiceFactory';

interface DiceRollOverlay3DProps {
  readonly event: DiceVisualEvent;
  readonly onComplete: () => void;
}

interface PhysicsDie {
  readonly visual: VisualDieObject;
  readonly body: RigidBody;
  readonly definition: ReturnType<typeof getDieDefinition>;
  readonly authoritativeValue: number;
  readonly fromRotation: Quaternion;
  readonly targetRotation: Quaternion;
  readonly settledPosition: Vector3;
}

const initializeRapier = createSharedInitializer(() => RAPIER.init());

function randomBetween(minimum: number, maximum: number): number {
  return minimum + Math.random() * (maximum - minimum);
}

function easedReconcile(progress: number): number {
  const bounded = Math.max(0, Math.min(1, progress));
  return bounded < 0.5 ? 4 * bounded * bounded * bounded : 1 - Math.pow(-2 * bounded + 2, 3) / 2;
}

export default function DiceRollOverlay3D({ event, onComplete }: DiceRollOverlay3DProps) {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const stageElement = stage;
    let cancelled = false;
    let animationFrame = 0;
    let cleanupScene = () => {};
    const completeOnce = createCompletionGate();
    const finish = () => {
      if (completeOnce()) onComplete();
    };

    async function start() {
      try {
        await initializeRapier();
        if (cancelled) return;

        const scene = new Scene();
        const camera = new PerspectiveCamera(42, 1, 0.1, 100);
        const renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
        renderer.setClearColor(0x000000, 0);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = PCFShadowMap;
        renderer.domElement.dataset.diceCanvas = 'true';
        stageElement.append(renderer.domElement);

        const ambient = new AmbientLight(0xffefd1, 1.25);
        scene.add(ambient);
        const keyLight = new DirectionalLight(0xffe2a8, 3.1);
        keyLight.position.set(4, 9, 5);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(1024, 1024);
        keyLight.shadow.camera.near = 1;
        keyLight.shadow.camera.far = 24;
        keyLight.shadow.camera.left = -9;
        keyLight.shadow.camera.right = 9;
        keyLight.shadow.camera.top = 7;
        keyLight.shadow.camera.bottom = -7;
        scene.add(keyLight);

        const shadowGeometry = new PlaneGeometry(16, 10);
        const shadowMaterial = new ShadowMaterial({ color: 0x000000, opacity: 0.2, transparent: true });
        const shadowPlane = new Mesh(shadowGeometry, shadowMaterial);
        shadowPlane.rotation.x = -Math.PI / 2;
        shadowPlane.position.y = -1.08;
        shadowPlane.receiveShadow = true;
        scene.add(shadowPlane);

        const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
        world.timestep = 1 / 60;
        const bounds = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
        world.createCollider(RAPIER.ColliderDesc.cuboid(7.5, 0.12, 5).setTranslation(0, -1.2, 0).setFriction(0.76).setRestitution(0.46), bounds);
        world.createCollider(RAPIER.ColliderDesc.cuboid(0.12, 3.5, 5).setTranslation(-7.5, 2, 0).setRestitution(0.52), bounds);
        world.createCollider(RAPIER.ColliderDesc.cuboid(0.12, 3.5, 5).setTranslation(7.5, 2, 0).setRestitution(0.52), bounds);
        world.createCollider(RAPIER.ColliderDesc.cuboid(7.5, 3.5, 0.12).setTranslation(0, 2, -5).setRestitution(0.52), bounds);
        world.createCollider(RAPIER.ColliderDesc.cuboid(7.5, 3.5, 0.12).setTranslation(0, 2, 5).setRestitution(0.52), bounds);

        const dice: PhysicsDie[] = event.dice.map((die, index) => {
          const visual = createVisualDieObject(die);
          const spawn = {
            x: 5.4 + randomBetween(-0.45, 0.45) + (index % 3) * 0.18,
            y: 3.6 + index * 0.28 + randomBetween(0, 0.8),
            z: -2.4 + (index - (event.dice.length - 1) / 2) * 0.48 + randomBetween(-0.25, 0.25),
          };
          const initialRotation = new Quaternion().setFromEuler(new Euler(
            randomBetween(0, Math.PI * 2),
            randomBetween(0, Math.PI * 2),
            randomBetween(0, Math.PI * 2),
            'XYZ',
          ));
          const body = world.createRigidBody(
            RAPIER.RigidBodyDesc.dynamic()
              .setTranslation(spawn.x, spawn.y, spawn.z)
              .setRotation(initialRotation)
              .setLinearDamping(0.23)
              .setAngularDamping(0.34)
              .setCcdEnabled(true),
          );
          const definition = getDieDefinition(die.sides);
          const collider = RAPIER.ColliderDesc.convexHull(visual.colliderVertices) ?? RAPIER.ColliderDesc.ball(0.82 * definition.scale);
          collider.setDensity(1.15).setFriction(0.72).setRestitution(0.56);
          world.createCollider(collider, body);
          body.setLinvel({
            x: randomBetween(-9.2, -7.2) - index * 0.08,
            y: randomBetween(0.5, 2.3),
            z: randomBetween(1.2, 3.1) + (index % 2 === 0 ? 0.6 : -0.6),
          }, true);
          body.setAngvel({
            x: randomBetween(-13, 13),
            y: randomBetween(-15, 15),
            z: randomBetween(-13, 13),
          }, true);
          visual.group.position.set(spawn.x, spawn.y, spawn.z);
          visual.group.quaternion.copy(initialRotation);
          scene.add(visual.group);
          const target = closestTargetQuaternionForFace(
            definition,
            die.value,
            [initialRotation.x, initialRotation.y, initialRotation.z, initialRotation.w],
          );
          return {
            visual,
            body,
            definition,
            authoritativeValue: die.value,
            fromRotation: new Quaternion(),
            targetRotation: new Quaternion(...target),
            settledPosition: new Vector3(),
          };
        });

        function resize() {
          const width = Math.max(1, window.innerWidth);
          const height = Math.max(1, window.innerHeight);
          camera.aspect = width / height;
          const narrowAdjustment = camera.aspect < 1 ? 4.5 : camera.aspect < 1.4 ? 2 : 0;
          camera.position.set(0, 7.8 + narrowAdjustment * 0.25, 13.5 + narrowAdjustment);
          camera.lookAt(0, 0.2, 0);
          camera.updateProjectionMatrix();
          renderer.setSize(width, height, false);
        }
        resize();
        window.addEventListener('resize', resize);

        const startedAt = performance.now();
        let state = createDiceAnimationState(startedAt);
        let lastFrameAt = startedAt;
        let accumulator = 0;
        let fallbackPrepared = false;
        let authoritativeRestFinalized = false;

        function stepDynamicWorld(deltaSeconds: number) {
          accumulator += deltaSeconds;
          while (accumulator >= world.timestep) {
            world.step();
            accumulator -= world.timestep;
          }
        }

        function syncDynamicDice() {
          for (const die of dice) {
            const position = die.body.translation();
            const rotation = die.body.rotation();
            die.visual.group.position.set(position.x, position.y, position.z);
            die.visual.group.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
          }
        }

        function motionMetrics() {
          let maximumLinearSpeed = 0;
          let maximumAngularSpeed = 0;
          for (const die of dice) {
            const linear = die.body.linvel();
            const angular = die.body.angvel();
            maximumLinearSpeed = Math.max(maximumLinearSpeed, Math.hypot(linear.x, linear.y, linear.z));
            maximumAngularSpeed = Math.max(maximumAngularSpeed, Math.hypot(angular.x, angular.y, angular.z));
          }
          return { maximumLinearSpeed, maximumAngularSpeed };
        }

        function updateClosestAuthoritativeTarget(die: PhysicsDie, current: Quaternion): number {
          const target = closestTargetQuaternionForFace(
            die.definition,
            die.authoritativeValue,
            [current.x, current.y, current.z, current.w],
          );
          die.targetRotation.set(...target).normalize();
          return current.angleTo(die.targetRotation);
        }

        function applyOrientationGuidance(
          die: PhysicsDie,
          deltaSeconds: number,
          strength: number,
          angularSpeedFraction: number,
          maximumRadiansPerSecond: number,
          minimumRadiansPerSecond = 0,
        ) {
          const rotation = die.body.rotation();
          const current = new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w).normalize();
          const error = updateClosestAuthoritativeTarget(die, current);
          const angular = die.body.angvel();
          const angularSpeed = Math.hypot(angular.x, angular.y, angular.z);
          const step = guidanceAngularStep(
            error,
            angularSpeed,
            deltaSeconds,
            strength,
            angularSpeedFraction,
            maximumRadiansPerSecond,
            minimumRadiansPerSecond,
          );
          if (step <= 0) return;
          current.rotateTowards(die.targetRotation, step);
          die.body.setRotation(current, true);
        }

        function applyEarlyHiddenGuidance(now: number, deltaSeconds: number) {
          const strength = earlyGuidanceStrength(now - startedAt);
          if (strength <= 0) return;
          for (const die of dice) {
            applyOrientationGuidance(
              die,
              deltaSeconds,
              strength,
              DICE_GUIDANCE.earlyAngularSpeedFraction,
              DICE_GUIDANCE.earlyMaximumRadiansPerSecond,
            );
          }
        }

        function prepareSettlingAssist() {
          for (const die of dice) {
            die.body.wakeUp();
          }
        }

        function applySettlingAssist(now: number, deltaSeconds: number) {
          const progress = Math.max(0, Math.min(1, (now - state.phaseStartedAt) / DICE_ANIMATION_TIMINGS.assistMs));
          const ramp = settlingAssistStrength(progress);
          const strength = DICE_GUIDANCE.earlyStrength
            + (DICE_GUIDANCE.finalStrength - DICE_GUIDANCE.earlyStrength) * ramp;
          const maximumRate = finalGuidanceMaximumRate(progress);

          for (const die of dice) {
            die.body.setLinearDamping(0.23 + 1.8 * ramp);
            die.body.setAngularDamping(0.34 + 3.2 * ramp);
            applyOrientationGuidance(
              die,
              deltaSeconds,
              strength,
              DICE_GUIDANCE.finalAngularSpeedFraction,
              maximumRate,
              DICE_GUIDANCE.finalMinimumRadiansPerSecond,
            );
          }
        }

        function allAuthoritativeFacesSettled(): boolean {
          return dice.every((die) => {
            const linear = die.body.linvel();
            const angular = die.body.angvel();
            const rotation = die.body.rotation();
            const current = new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w).normalize();
            const error = updateClosestAuthoritativeTarget(die, current);
            return Math.hypot(linear.x, linear.y, linear.z) <= DICE_SETTLING_THRESHOLDS.finalLinearSpeed
              && Math.hypot(angular.x, angular.y, angular.z) <= DICE_SETTLING_THRESHOLDS.finalAngularSpeed
              && error <= DICE_SETTLING_THRESHOLDS.finalAngularErrorRadians;
          });
        }

        function prepareFallbackReconciliation() {
          if (fallbackPrepared) return;
          fallbackPrepared = true;
          for (const die of dice) {
            const position = die.body.translation();
            const rotation = die.body.rotation();
            die.settledPosition.set(position.x, position.y, position.z);
            die.fromRotation.set(rotation.x, rotation.y, rotation.z, rotation.w).normalize();
            updateClosestAuthoritativeTarget(die, die.fromRotation);
            die.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
            die.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
            die.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, false);
          }
        }

        function finalizeAuthoritativeRest() {
          if (authoritativeRestFinalized) return;
          authoritativeRestFinalized = true;
          for (const die of dice) {
            if (!fallbackPrepared) {
              const position = die.body.translation();
              die.settledPosition.set(position.x, position.y, position.z);
              die.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
              die.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
              die.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, false);
            }
            die.visual.group.position.copy(die.settledPosition);
            die.visual.group.quaternion.copy(die.targetRotation);
            die.body.setTranslation(die.settledPosition, false);
            die.body.setRotation(die.targetRotation, false);
          }
        }

        function renderFrameUnsafe(now: number) {
          if (cancelled) return;
          const deltaSeconds = Math.min((now - lastFrameAt) / 1000, 0.05);
          lastFrameAt = now;
          const metrics = motionMetrics();
          const settleAssistReady = shouldBeginSettlingAssist(
            now - startedAt,
            metrics.maximumLinearSpeed,
            metrics.maximumAngularSpeed,
          );
          const authoritativeOrientationReached = state.phase === 'assisting' && allAuthoritativeFacesSettled();
          const previousPhase = state.phase;
          state = advanceDiceAnimation(state, now, settleAssistReady, authoritativeOrientationReached);

          if (previousPhase === 'throwing' && state.phase === 'assisting') prepareSettlingAssist();
          if ((previousPhase === 'throwing' || previousPhase === 'assisting') && state.phase === 'reconciling') {
            prepareFallbackReconciliation();
          }

          if (state.phase === 'throwing') {
            stepDynamicWorld(deltaSeconds);
            applyEarlyHiddenGuidance(now, deltaSeconds);
            syncDynamicDice();
          } else if (state.phase === 'assisting') {
            stepDynamicWorld(deltaSeconds);
            applySettlingAssist(now, deltaSeconds);
            syncDynamicDice();
          } else if (state.phase === 'reconciling') {
            prepareFallbackReconciliation();
            const progress = easedReconcile((now - state.phaseStartedAt) / DICE_ANIMATION_TIMINGS.reconcileMs);
            for (const die of dice) {
              die.visual.group.quaternion.slerpQuaternions(die.fromRotation, die.targetRotation, progress);
              die.visual.group.position.copy(die.settledPosition);
              die.body.setRotation(die.visual.group.quaternion, false);
              die.body.setTranslation(die.visual.group.position, false);
            }
          } else if (state.phase !== 'complete') {
            finalizeAuthoritativeRest();
          }

          const emphasisProgress = resultEmphasisProgress(state, now);
          for (const die of dice) die.visual.setResultEmphasis(emphasisProgress);

          renderer.domElement.style.opacity = state.phase === 'fading'
            ? String(Math.max(0, 1 - (now - state.phaseStartedAt) / DICE_ANIMATION_TIMINGS.fadeMs))
            : state.phase === 'complete' ? '0' : '1';
          renderer.render(scene, camera);
          if (state.phase === 'complete') {
            finish();
            return;
          }
          animationFrame = window.requestAnimationFrame(renderFrame);
        }

        function renderFrame(now: number) {
          runVisualFrameFailOpen(() => renderFrameUnsafe(now), finish);
        }

        cleanupScene = () => {
          window.cancelAnimationFrame(animationFrame);
          window.removeEventListener('resize', resize);
          for (const die of dice) {
            scene.remove(die.visual.group);
            die.visual.dispose();
          }
          shadowGeometry.dispose();
          shadowMaterial.dispose();
          renderer.dispose();
          renderer.forceContextLoss();
          renderer.domElement.remove();
          world.free();
        };
        animationFrame = window.requestAnimationFrame(renderFrame);
      } catch {
        if (!cancelled) finish();
      }
    }

    void start();
    return () => {
      cancelled = true;
      cleanupScene();
    };
  }, [event, onComplete]);

  return <div ref={stageRef} className="dice-roll-overlay__stage" aria-label={`Visual dice animation: ${event.title}`} />;
}
