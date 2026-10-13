"""Bootstrap a fresh K8s cluster on user-supplied bare-metal/VM nodes via
Kubespray, producing a kubeconfig that can be fed into the normal
"create cluster" wizard (see ``docs/design/cluster-design.md#kubernetes-bootstrap`` at the repo
root). Deliberately independent of ``llm_d_lens.cluster.registry`` -- a
:class:`~llm_d_lens.cluster.bootstrap.models.BootstrapJob` only lives long
enough to hand a kubeconfig string back to the caller; it never becomes a
registered ``Cluster`` by itself.
"""
