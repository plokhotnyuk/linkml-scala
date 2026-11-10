"""Decode publication metadata without fetching its references."""

import json

from .generated import ArtifactOrigin, Format, Publication

_FORMATS = {value.value for value in Format}
_ORIGINS = {value.value for value in ArtifactOrigin}


def _is_new(value, known) -> bool:
    """Whether a value is text outside an enum, so added to it after this SDK version."""
    return isinstance(value, str) and value not in known


def decode_publication(text: str) -> Publication:
    """Return validated publication fields, discarding extras, or raise ValueError.

    Artifacts with a format or origin added after this SDK version are discarded.
    """
    data = json.loads(text)
    if isinstance(data, dict) and isinstance(artifacts := data.get("artifacts"), list):
        known = [artifact for artifact in artifacts if not isinstance(artifact, dict) or not (
            _is_new(artifact.get("format"), _FORMATS) or _is_new(artifact.get("origin"), _ORIGINS))]
        if artifacts and not known:
            raise ValueError("publication has no artifacts that this SDK version supports")
        data["artifacts"] = known
    publication = Publication.model_validate(data, extra="ignore")
    if publication.preferred_prefix is not None and publication.namespace_iri is None:
        raise ValueError("preferred_prefix requires namespace_iri")
    artifact_urls = [artifact.url for artifact in publication.artifacts]
    if len(set(artifact_urls)) != len(artifact_urls):
        raise ValueError("artifacts must have unique URLs")
    dependency_urls = [dependency.base_url for dependency in publication.dependencies]
    if len(set(dependency_urls)) != len(dependency_urls):
        raise ValueError("dependencies must have unique base_url values")
    if publication.base_url in dependency_urls:
        raise ValueError("dependencies must not contain the publication itself")
    return publication
