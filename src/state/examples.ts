// Built-in example topologies (F2). The YAML files are bundled as text, so they
// work offline and stay the single copy shared with the docs and tests.
import square from '../../examples/01-square.yaml?raw'
import ring from '../../examples/02-ring5.yaml?raw'
import ringHigh from '../../examples/03-ring5-highmetric.yaml?raw'
import isp from '../../examples/04-isp-core.yaml?raw'
import leafSpine from '../../examples/05-leaf-spine.yaml?raw'
import linkProtecting from '../../examples/06-link-protecting.yaml?raw'
import parallel from '../../examples/07-parallel.yaml?raw'
import type { NodeId, Topology } from '../engine/types'
import { parseTopology } from '../io/yaml'

export interface Example {
  key: string
  title: string
  /** The source the docs use for this example. */
  source: NodeId
  yaml: string
}

export const EXAMPLES: Example[] = [
  { key: 'square', title: 'Square: LFA works', source: 'S', yaml: square },
  { key: 'ring5', title: 'Ring: Remote LFA works', source: 'S', yaml: ring },
  {
    key: 'ring5-high',
    title: 'Ring, high metric: TI-LFA needs an Adj-SID',
    source: 'S',
    yaml: ringHigh,
  },
  { key: 'isp-core', title: 'Small ISP core', source: 'PE1', yaml: isp },
  { key: 'leaf-spine', title: 'Leaf-spine fabric', source: 'L1', yaml: leafSpine },
  {
    key: 'link-protecting',
    title: 'Link-protecting LFA: breaks when E fails',
    source: 'S',
    yaml: linkProtecting,
  },
  { key: 'parallel', title: 'Parallel links: bundles S–E and E–D', source: 'S', yaml: parallel },
]

/** The example's topology. The files are checked by tests, so a failure here is a bug. */
export function exampleTopology(example: Example): Topology {
  const r = parseTopology(example.yaml)
  if (!r.ok) throw new Error(`Built-in example ${example.key} is invalid: ${r.errors.join(' ')}`)
  return r.topology
}
