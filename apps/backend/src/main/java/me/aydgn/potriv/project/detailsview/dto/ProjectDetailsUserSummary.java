package me.aydgn.potriv.project.detailsview.dto;

import java.util.UUID;

public record ProjectDetailsUserSummary(
    UUID userId,
    String name,
    String email
) {

}
