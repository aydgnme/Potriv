package me.aydgn.potriv.project.teamfinder;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record TeamFinderResponse(
    UUID projectId,
    OffsetDateTime generatedAt,
    TeamFinderCriteria criteria,
    int candidateCount,
    List<TeamFinderCandidateResponse> candidates
) {

}
