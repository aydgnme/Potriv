package me.aydgn.potriv.project.detailsview.dto;

import java.util.UUID;

public record ProjectDetailsTechnologyResponse(
    UUID technologyId,
    String name
) {

}
