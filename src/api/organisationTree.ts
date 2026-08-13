import { invokeSupabaseFunction } from '@/src/services/supabase';
import { OrganisationTree, OrganisationTreeNode } from '@/src/types/eventorSeries';

type TreeNodeResponse = {
  id: number;
  name: string;
  shortName: string | null;
  type: string | null;
  parentOrganisationId: number | null;
};

type TreeResponse = {
  organisation: TreeNodeResponse;
  ancestors: TreeNodeResponse[];
};

const treeCache = new Map<number, OrganisationTree>();

function toNode(node: TreeNodeResponse): OrganisationTreeNode {
  return {
    id: node.id,
    name: node.name,
    parentOrganisationId: node.parentOrganisationId ?? null,
    shortName: node.shortName ?? null,
    type: node.type ?? null,
  };
}

// Fetches the organisation branch (the organisation itself plus every ancestor
// up to the root) from the Supabase organisation-tree edge function.
export async function fetchOrganisationTree(organisationId: number): Promise<OrganisationTree> {
  const cached = treeCache.get(organisationId);
  if (cached) {
    return cached;
  }

  const data = await invokeSupabaseFunction<TreeResponse>('organisation-tree', { organisationId });

  if (!data?.organisation) {
    throw new Error('Organisationen kunde inte hittas i registret.');
  }

  const tree: OrganisationTree = {
    ancestors: (data.ancestors ?? []).map(toNode),
    organisation: toNode(data.organisation),
  };

  treeCache.set(organisationId, tree);
  return tree;
}
