package eu.neverblink.ohi.sdk;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;
import java.util.stream.Collectors;

/** Publication metadata. */
public final class Publications {
    private Publications() {
    }

    static final Set<String> FORMATS =
            Arrays.stream(Format.values()).map(Format::getValue).collect(Collectors.toSet());
    private static final Set<String> ORIGINS =
            Arrays.stream(ArtifactOrigin.values()).map(ArtifactOrigin::getValue).collect(Collectors.toSet());

    /**
     * Decodes publication metadata without fetching what it references. Properties that the model
     * doesn't have are discarded, and so are artifacts with a format or origin added after this SDK
     * version.
     *
     * @throws IllegalArgumentException if the text is not valid publication metadata
     */
    public static Publication decode(String text) {
        Publication publication;
        try {
            JsonNode data = Json.MAPPER.readTree(text);
            if (data != null && data.path("artifacts").isArray()) {
                ArrayNode artifacts = (ArrayNode) data.get("artifacts");
                boolean any = !artifacts.isEmpty();
                for (Iterator<JsonNode> it = artifacts.elements(); it.hasNext(); ) {
                    JsonNode artifact = it.next();
                    if (isNew(artifact.path("format"), FORMATS) || isNew(artifact.path("origin"), ORIGINS)) {
                        it.remove();
                    }
                }
                if (any && artifacts.isEmpty()) {
                    throw new IllegalArgumentException("publication has no artifacts that this SDK version supports");
                }
            }
            publication = Json.MAPPER.treeToValue(data, Publication.class);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Invalid publication metadata: " + e.getOriginalMessage(), e);
        }
        if (publication == null) {
            throw new IllegalArgumentException("Invalid publication metadata: null");
        }
        if (publication.getPreferredPrefix() != null && publication.getNamespaceIri() == null) {
            throw new IllegalArgumentException("preferred_prefix requires namespace_iri");
        }
        Set<String> urls = new HashSet<>();
        for (Artifact artifact : publication.getArtifacts()) {
            if (!urls.add(artifact.getUrl())) {
                throw new IllegalArgumentException("artifacts must have unique URLs");
            }
            artifact.getExtraProperties().clear();
        }
        Set<String> bases = new HashSet<>();
        for (Dependency dependency : publication.getDependencies()) {
            if (!bases.add(dependency.getBaseUrl())) {
                throw new IllegalArgumentException("dependencies must have unique base_url values");
            }
            dependency.getExtraProperties().clear();
        }
        if (bases.contains(publication.getBaseUrl())) {
            throw new IllegalArgumentException("dependencies must not contain the publication itself");
        }
        publication.getExtraProperties().clear();
        return publication;
    }

    /** Whether a value is text outside an enum, so added to it after this SDK version. */
    static boolean isNew(JsonNode value, Set<String> known) {
        return value.isTextual() && !known.contains(value.textValue());
    }
}
