// lib/urdf-parser.ts — Client-side URDF XML parser for extracting physics parameters.
//
// Uses the browser-native DOMParser (no dependencies). Extracts per-link inertial
// properties, joint limits, and transmission/actuator mappings from URDF XML.

// ── Types ────────────────────────────────────────────────────────────────

export interface URDFInertial {
  name: string;
  mass: number;
  origin: { xyz: [number, number, number]; rpy: [number, number, number] };
  inertia: {
    ixx: number; ixy: number; ixz: number;
    iyy: number; iyz: number; izz: number;
  };
}

export type URDFJointType = 'revolute' | 'prismatic' | 'continuous' | 'fixed' | 'floating' | 'planar';

export interface URDFJoint {
  name: string;
  type: URDFJointType;
  parent_link: string;
  child_link: string;
  axis: [number, number, number];
  limits?: {
    lower: number;
    upper: number;
    effort: number;
    velocity: number;
  };
}

export interface URDFTransmission {
  name: string;
  type: string;
  joint_name: string;
  actuator_name: string;
  mechanical_reduction: number;
}

export interface URDFParseResult {
  robot_name: string;
  links: URDFInertial[];
  joints: URDFJoint[];
  transmissions: URDFTransmission[];
  warnings: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────

function parseFloats(s: string): number[] {
  return s.trim().split(/\s+/).map(Number);
}

function getAttrFloat(el: Element, attr: string, fallback = 0): number {
  const v = el.getAttribute(attr);
  return v != null ? Number(v) : fallback;
}

// ── Main Parser ──────────────────────────────────────────────────────────

export function parseURDF(xmlString: string): URDFParseResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');
  const warnings: string[] = [];

  // Check for parse errors
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`Invalid URDF XML: ${parseError.textContent?.slice(0, 200)}`);
  }

  const robotEl = doc.querySelector('robot');
  if (!robotEl) {
    throw new Error('No <robot> element found. This does not appear to be a valid URDF file.');
  }

  const robot_name = robotEl.getAttribute('name') || 'unnamed_robot';

  // ── Parse links ──────────────────────────────────────────────────
  const links: URDFInertial[] = [];
  const linkEls = robotEl.querySelectorAll(':scope > link');

  for (const linkEl of linkEls) {
    const linkName = linkEl.getAttribute('name') || 'unnamed_link';
    const inertialEl = linkEl.querySelector(':scope > inertial');

    if (!inertialEl) {
      warnings.push(`Link "${linkName}" has no <inertial> tag`);
      continue;
    }

    // Mass
    const massEl = inertialEl.querySelector(':scope > mass');
    const mass = massEl ? getAttrFloat(massEl, 'value', 0) : 0;
    if (mass === 0) {
      warnings.push(`Link "${linkName}" has zero mass`);
    }

    // Origin
    const originEl = inertialEl.querySelector(':scope > origin');
    let xyz: [number, number, number] = [0, 0, 0];
    let rpy: [number, number, number] = [0, 0, 0];
    if (originEl) {
      const xyzAttr = originEl.getAttribute('xyz');
      if (xyzAttr) {
        const vals = parseFloats(xyzAttr);
        xyz = [vals[0] || 0, vals[1] || 0, vals[2] || 0];
      }
      const rpyAttr = originEl.getAttribute('rpy');
      if (rpyAttr) {
        const vals = parseFloats(rpyAttr);
        rpy = [vals[0] || 0, vals[1] || 0, vals[2] || 0];
      }
    }

    // Inertia tensor
    const inertiaEl = inertialEl.querySelector(':scope > inertia');
    const inertia = {
      ixx: inertiaEl ? getAttrFloat(inertiaEl, 'ixx') : 0,
      ixy: inertiaEl ? getAttrFloat(inertiaEl, 'ixy') : 0,
      ixz: inertiaEl ? getAttrFloat(inertiaEl, 'ixz') : 0,
      iyy: inertiaEl ? getAttrFloat(inertiaEl, 'iyy') : 0,
      iyz: inertiaEl ? getAttrFloat(inertiaEl, 'iyz') : 0,
      izz: inertiaEl ? getAttrFloat(inertiaEl, 'izz') : 0,
    };

    links.push({ name: linkName, mass, origin: { xyz, rpy }, inertia });
  }

  // ── Parse joints ─────────────────────────────────────────────────
  const joints: URDFJoint[] = [];
  const jointEls = robotEl.querySelectorAll(':scope > joint');

  for (const jointEl of jointEls) {
    const name = jointEl.getAttribute('name') || 'unnamed_joint';
    const type = (jointEl.getAttribute('type') || 'fixed') as URDFJointType;

    const parentEl = jointEl.querySelector(':scope > parent');
    const childEl = jointEl.querySelector(':scope > child');
    const parent_link = parentEl?.getAttribute('link') || '';
    const child_link = childEl?.getAttribute('link') || '';

    // Axis
    const axisEl = jointEl.querySelector(':scope > axis');
    let axis: [number, number, number] = [1, 0, 0];
    if (axisEl) {
      const xyzAttr = axisEl.getAttribute('xyz');
      if (xyzAttr) {
        const vals = parseFloats(xyzAttr);
        axis = [vals[0] || 0, vals[1] || 0, vals[2] || 0];
      }
    }

    // Limits
    const limitEl = jointEl.querySelector(':scope > limit');
    let limits: URDFJoint['limits'] | undefined;

    if (limitEl) {
      limits = {
        lower: getAttrFloat(limitEl, 'lower', 0),
        upper: getAttrFloat(limitEl, 'upper', 0),
        effort: getAttrFloat(limitEl, 'effort', 0),
        velocity: getAttrFloat(limitEl, 'velocity', 0),
      };
    } else if (type === 'revolute' || type === 'prismatic') {
      warnings.push(`Joint "${name}" (${type}) has no <limit> tag`);
    }

    if (type === 'continuous' && !limits) {
      // Continuous joints may have effort/velocity limits but no position limits
      warnings.push(`Continuous joint "${name}" has no <limit> tag — effort and velocity will be 0`);
    }

    joints.push({ name, type, parent_link, child_link, axis, limits });
  }

  // ── Parse transmissions ──────────────────────────────────────────
  const transmissions: URDFTransmission[] = [];
  const txEls = robotEl.querySelectorAll(':scope > transmission');

  for (const txEl of txEls) {
    const txName = txEl.getAttribute('name') || 'unnamed_transmission';

    const typeEl = txEl.querySelector(':scope > type');
    const txType = typeEl?.textContent?.trim() || '';

    const jointEl = txEl.querySelector(':scope > joint');
    const joint_name = jointEl?.getAttribute('name') || '';

    const actuatorEl = txEl.querySelector(':scope > actuator');
    const actuator_name = actuatorEl?.getAttribute('name') || joint_name + '_actuator';

    const reductionEl = actuatorEl?.querySelector(':scope > mechanicalReduction')
      || txEl.querySelector(':scope > mechanicalReduction');
    const mechanical_reduction = reductionEl ? Number(reductionEl.textContent?.trim()) || 1 : 1;

    if (joint_name) {
      transmissions.push({ name: txName, type: txType, joint_name, actuator_name, mechanical_reduction });
    }
  }

  return { robot_name, links, joints, transmissions, warnings };
}

// ── Convert parse result to physics schema ───────────────────────────────

export interface PhysicsFromURDF {
  inertial_params: Record<string, unknown>;
  joint_limits: Array<{ name: string; lower: number; upper: number; effort: number; velocity: number }>;
  actuator_limits: Array<{ name: string; max_torque: number; max_velocity: number }>;
}

export function urdfResultToPhysics(result: URDFParseResult): PhysicsFromURDF {
  const total_mass_kg = result.links.reduce((sum, l) => sum + l.mass, 0);

  // Count joint types
  const joint_type_counts: Record<string, number> = {};
  for (const j of result.joints) {
    joint_type_counts[j.type] = (joint_type_counts[j.type] || 0) + 1;
  }

  const dof_count = result.joints.filter(j => j.type !== 'fixed').length;

  // Joint types lookup for display
  const joint_types: Record<string, string> = {};
  for (const j of result.joints) {
    joint_types[j.name] = j.type;
  }

  // Structured inertial_params
  const inertial_params: Record<string, unknown> = {
    source: 'urdf',
    robot_name: result.robot_name,
    total_mass_kg,
    dof_count,
    joint_type_counts,
    joint_types,
    links: result.links.map(l => ({
      name: l.name,
      mass: l.mass,
      origin: l.origin,
      inertia: l.inertia,
    })),
  };

  // Joint limits from revolute, prismatic, and continuous joints
  const joint_limits = result.joints
    .filter(j => j.type !== 'fixed' && j.type !== 'floating' && j.type !== 'planar')
    .map(j => ({
      name: j.name,
      lower: j.limits?.lower ?? (j.type === 'continuous' ? -3.14159 : 0),
      upper: j.limits?.upper ?? (j.type === 'continuous' ? 3.14159 : 0),
      effort: j.limits?.effort ?? 0,
      velocity: j.limits?.velocity ?? 0,
    }));

  // Actuator limits from transmissions, or fallback to joints
  let actuator_limits: Array<{ name: string; max_torque: number; max_velocity: number }>;

  if (result.transmissions.length > 0) {
    actuator_limits = result.transmissions.map(tx => {
      const joint = result.joints.find(j => j.name === tx.joint_name);
      const effort = joint?.limits?.effort ?? 0;
      const velocity = joint?.limits?.velocity ?? 0;
      return {
        name: tx.actuator_name,
        max_torque: effort * tx.mechanical_reduction,
        max_velocity: tx.mechanical_reduction > 0 ? velocity / tx.mechanical_reduction : velocity,
      };
    });
  } else {
    // No transmissions — derive 1:1 from joint limits
    actuator_limits = joint_limits.map(jl => ({
      name: jl.name + '_actuator',
      max_torque: jl.effort,
      max_velocity: jl.velocity,
    }));
  }

  return { inertial_params, joint_limits, actuator_limits };
}

// ── File reader utility ──────────────────────────────────────────────────

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
