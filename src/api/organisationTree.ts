import { getSupabaseClient, invokeSupabaseFunction } from '@/src/services/supabase';
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

type OrganisationRow = {
  Id: number;
  Name: string;
  ShortName: string | null;
  Type: string | null;
  ParentOrganisationId: number | null;
};

let cachedList: OrganisationTreeNode[] | null = null;

// Fetches the full organisation list straight from the OrganisationRegister
// table (anon RLS allows select). Cached for the session; used for org search.
export async function fetchOrganisationList(): Promise<OrganisationTreeNode[]> {
  if (cachedList) {
    return cachedList;
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase är inte konfigurerat i appens miljövariabler.');
  }

  const { data, error } = await client
    .from('OrganisationRegister')
    .select('Id, Name, ShortName, Type, ParentOrganisationId')
    .order('Name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  cachedList = ((data ?? []) as OrganisationRow[]).map((row) => ({
    id: row.Id,
    name: row.Name,
    parentOrganisationId: row.ParentOrganisationId ?? null,
    shortName: row.ShortName ?? null,
    type: row.Type ?? null,
  }));
  return cachedList;
}
