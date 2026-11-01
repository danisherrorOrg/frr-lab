// Built-in example topologies (F2). The YAML files are bundled as text, so they
// work offline and stay the single copy shared with the docs and tests.
import square from '../../examples/01-square.yaml?raw'
import ring from '../../examples/02-ring5.yaml?raw'
import ringHigh from '../../examples/03-ring5-highmetric.yaml?raw'
import isp from '../../examples/04-isp-core.yaml?raw'
import leafSpine from '../../examples/05-leaf-spine.yaml?raw'
import linkProtecting from '../../examples/06-link-protecting.yaml?raw'
import parallel from '../../examples/07-parallel.yaml?raw'
import nodeProtection from '../../examples/08-node-protection.yaml?raw'
import srlg from '../../examples/09-srlg.yaml?raw'
import lanLevels from '../../examples/10-lan-levels.yaml?raw'
import flexAlgo from '../../examples/11-flex-algo.yaml?raw'
import type { NodeId, Topology } from '../engine/types'
import { parseTopology } from '../io/yaml'

export interface Example {
  key: string
  /** File name in examples/, e.g. `02-ring5.yaml` (the Learn guide links to it, D60). */
  file: string
  title: string
  /** The source the docs use for this example. */
  source: NodeId
  yaml: string
}

export const EXAMPLES: Example[] = [
  { key: 'square', file: '01-square.yaml', title: 'Square: LFA works', source: 'S', yaml: square },
  { key: 'ring5', file: '02-ring5.yaml', title: 'Ring: Remote LFA works', source: 'S', yaml: ring },
  {
    key: 'ring5-high',
    file: '03-ring5-highmetric.yaml',
    title: 'Ring, high metric: TI-LFA needs an Adj-SID',
    source: 'S',
    yaml: ringHigh,
  },
  { key: 'isp-core', file: '04-isp-core.yaml', title: 'Small ISP core', source: 'PE1', yaml: isp },
  {
    key: 'leaf-spine',
    file: '05-leaf-spine.yaml',
    title: 'Leaf-spine fabric',
    source: 'L1',
    yaml: leafSpine,
  },
  {
    key: 'link-protecting',
    file: '06-link-protecting.yaml',
    title: 'Link-protecting LFA: breaks when E fails',
    source: 'S',
    yaml: linkProtecting,
  },
  {
    key: 'parallel',
    file: '07-parallel.yaml',
    title: 'Parallel links: bundles S–E and E–D',
    source: 'S',
    yaml: parallel,
  },
  {
    key: 'node-protection',
    file: '08-node-protection.yaml',
    title: 'Node protection: avoid the next-hop router',
    source: 'S',
    yaml: nodeProtection,
  },
  {
    key: 'srlg',
    file: '09-srlg.yaml',
    title: 'SRLG: one duct, two links',
    source: 'S',
    yaml: srlg,
  },
  {
    key: 'lan-levels',
    file: '10-lan-levels.yaml',
    title: 'LAN and IS-IS levels',
    source: 'R2',
    yaml: lanLevels,
  },
  {
    key: 'flex-algo',
    file: '11-flex-algo.yaml',
    title: 'Flex-Algo: low delay, avoid red',
    source: 'S',
    yaml: flexAlgo,
  },
]

/** The example's topology. The files are checked by tests, so a failure here is a bug. */
export function exampleTopology(example: Example): Topology {
  const r = parseTopology(example.yaml)
  if (!r.ok) throw new Error(`Built-in example ${example.key} is invalid: ${r.errors.join(' ')}`)
  return r.topology
}
