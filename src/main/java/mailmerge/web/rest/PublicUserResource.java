package mailmerge.web.rest;

import java.util.List;

import mailmerge.service.UserService;
import mailmerge.service.dto.PublicUserDTO;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import tech.jhipster.web.util.PaginationUtil;

@RestController
@RequestMapping("/api")
public class PublicUserResource {

    private static final Logger LOG = LoggerFactory.getLogger(PublicUserResource.class);

    private final UserService userService;

    public PublicUserResource(UserService userService) {
        this.userService = userService;
    }

    /**
     * {@code GET /users} : get all users with ONLY public information.
     *
     * This endpoint is public and must NOT expose private fields
     * such as email, authorities, or emailSignature.
     *
     * @param pageable the pagination information.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)}
     *         and the list of public users.
     */
    @GetMapping("/users")
    public ResponseEntity<List<PublicUserDTO>> getAllPublicUsers(
        @org.springdoc.core.annotations.ParameterObject Pageable pageable
    ) {
        LOG.debug("REST request to get all public users");

        final Page<PublicUserDTO> page = userService.getAllPublicUsers(pageable);

        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(
            ServletUriComponentsBuilder.fromCurrentRequest(),
            page
        );

        return new ResponseEntity<>(page.getContent(), headers, HttpStatus.OK);
    }
}
